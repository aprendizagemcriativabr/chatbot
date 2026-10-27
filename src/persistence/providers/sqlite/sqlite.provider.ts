import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  AppConfigRepository,
  ArticulatorRepository,
  ConversationAnswerRepository,
  ConversationRepository,
  GoogleOAuthTokenRepository,
  PersistenceProvider,
  QuestionRepository,
  Repositories,
  TransactionContext,
  UnitOfWork,
} from "../../contracts/types.js";
import type { QuestionInput } from "../../../schemas/question.schema.js";

function toDate(value: string): Date {
  return new Date(value);
}

function dbHandle(tx: TransactionContext): DatabaseSync {
  return tx.handle as DatabaseSync;
}

function normalizeOptionValue(raw: string, fallbackIndex: number): string {
  const normalized = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_");

  return normalized || `opcao_${fallbackIndex + 1}`;
}

class SqliteUnitOfWork implements UnitOfWork {
  constructor(private readonly db: DatabaseSync) {}
  async withTransaction<T>(operation: (tx: TransactionContext) => Promise<T>): Promise<T> {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = await operation({ provider: "sqlite", handle: this.db }); this.db.exec("COMMIT"); return result; }
    catch (error) { try { this.db.exec("ROLLBACK"); } catch {} throw error; }
  }
}

class SqliteArticulatorRepository implements ArticulatorRepository { constructor(private readonly db: DatabaseSync) {}
  async existsActiveByPhone(phone: string): Promise<boolean> { const row = this.db.prepare("SELECT 1 AS e FROM articulator WHERE phone = ? AND deleted_at IS NULL LIMIT 1").get(phone) as { e: number }|undefined; return row?.e===1; }
  async listActive() { const rows = this.db.prepare("SELECT id,name,phone,created_at,updated_at FROM articulator WHERE deleted_at IS NULL ORDER BY name ASC").all() as Array<{id:number;name:string;phone:string;created_at:string;updated_at:string}>; return rows.map((r)=>({...r,created_at:toDate(r.created_at),updated_at:toDate(r.updated_at)})); }
  async findActiveIdByPhone(phone: string): Promise<number | null> { const row=this.db.prepare("SELECT id FROM articulator WHERE phone=? AND deleted_at IS NULL LIMIT 1").get(phone) as {id:number}|undefined; return row?.id??null; }
  async findActiveNameByPhone(phone: string): Promise<string | null> { const row=this.db.prepare("SELECT name FROM articulator WHERE phone=? AND deleted_at IS NULL LIMIT 1").get(phone) as {name:string}|undefined; return row?.name??null; }
  async findActive(tx: TransactionContext) { const rows=dbHandle(tx).prepare("SELECT id,name,phone,created_at,updated_at FROM articulator WHERE deleted_at IS NULL ORDER BY name ASC").all() as Array<{id:number;name:string;phone:string;created_at:string;updated_at:string}>; return rows.map((r)=>({...r,created_at:toDate(r.created_at),updated_at:toDate(r.updated_at)})); }
  async findByPhones(tx: TransactionContext, phones: string[]) { if (!phones.length) return []; const placeholders=phones.map(()=>"?").join(","); const rows=dbHandle(tx).prepare(`SELECT id,name,phone,created_at,updated_at,deleted_at FROM articulator WHERE phone IN (${placeholders})`).all(...phones) as Array<{id:number;name:string;phone:string;created_at:string;updated_at:string;deleted_at:string|null}>; return rows.map((r)=>({...r,created_at:toDate(r.created_at),updated_at:toDate(r.updated_at),deleted_at:r.deleted_at?toDate(r.deleted_at):null})); }
  async softDeleteByPhones(tx: TransactionContext, phones: string[]): Promise<void> { if(!phones.length) return; const placeholders=phones.map(()=>"?").join(","); dbHandle(tx).prepare(`UPDATE articulator SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE deleted_at IS NULL AND phone IN (${placeholders})`).run(...phones); }
  async insert(tx: TransactionContext, articulator: { name: string; phone: string }): Promise<void> { dbHandle(tx).prepare("INSERT INTO articulator (name,phone,created_at,updated_at,deleted_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)").run(articulator.name, articulator.phone); }
  async reactivate(tx: TransactionContext, articulatorId: number, name: string): Promise<void> { dbHandle(tx).prepare("UPDATE articulator SET name=?, deleted_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(name, articulatorId); }
  async updateName(tx: TransactionContext, articulatorId: number, name: string): Promise<void> { dbHandle(tx).prepare("UPDATE articulator SET name=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(name, articulatorId); }
}

class SqliteConversationRepository implements ConversationRepository { constructor(private readonly db: DatabaseSync) {}
  async findActiveByArticulatorId(articulatorId: number) { return (this.db.prepare("SELECT id,stage,current_question_order FROM conversation WHERE articulator_id=? AND deleted_at IS NULL LIMIT 1").get(articulatorId) as {id:number;stage:any;current_question_order:number|null}|undefined)??null; }
  async create(articulatorId: number, stage: string): Promise<number> { return Number(this.db.prepare("INSERT INTO conversation (articulator_id,stage) VALUES (?,?)").run(articulatorId,stage).lastInsertRowid); }
  async updateStage(conversationId: number, stage: string): Promise<void> { this.db.prepare("UPDATE conversation SET stage=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(stage,conversationId); }
  async updateStageAndQuestion(conversationId: number, stage: string, currentQuestionOrder: number | null): Promise<void> { this.db.prepare("UPDATE conversation SET stage=?, current_question_order=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(stage,currentQuestionOrder,conversationId); }
  async deleteConversationAndAnswers(conversationId: number): Promise<void> { this.db.prepare("DELETE FROM conversation_answer WHERE conversation_id=?").run(conversationId); this.db.prepare("DELETE FROM conversation WHERE id=?").run(conversationId); }
}

class SqliteQuestionRepository implements QuestionRepository { constructor(private readonly db: DatabaseSync) {}
  async listAll() {
    const rows = this.db.prepare("SELECT id,text,type,helper_text,required,\"order\" as [order],created_at,updated_at FROM question ORDER BY \"order\" ASC").all() as any[];
    return this.attachOptions(this.db, rows);
  }
  async findAll(tx: TransactionContext) {
    const db = dbHandle(tx);
    const rows = db.prepare("SELECT id,text,type,helper_text,required,\"order\" as [order],created_at,updated_at FROM question ORDER BY \"order\" ASC").all() as any[];
    return this.attachOptions(db, rows);
  }
  async findByOrder(order: number) {
    const row = this.db.prepare("SELECT id,text,type,helper_text,required,\"order\" as [order],created_at,updated_at FROM question WHERE \"order\"=? LIMIT 1").get(order) as any;
    if (!row) return null;
    return this.attachOptions(this.db, [row])[0] ?? null;
  }
  async deleteAll(tx: TransactionContext): Promise<void> {
    const db = dbHandle(tx);
    db.prepare("DELETE FROM question_option").run();
    db.prepare("DELETE FROM question").run();
  }
  async insert(tx: TransactionContext, question: QuestionInput): Promise<void> {
    const db = dbHandle(tx);
    const req = Number(question.required ?? true);
    const result = db.prepare("INSERT INTO question (text,type,helper_text,required,\"order\",created_at,updated_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").run(question.text,question.type,question.helperText ?? null,req,question.order);
    const questionId = Number(result.lastInsertRowid);
    if (question.type === "text") return;
    const options = question.options ?? [];
    for (let index = 0; index < options.length; index += 1) {
      const title = options[index].trim();
      db.prepare("INSERT INTO question_option (question_id,title,value,\"order\",created_at,updated_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").run(questionId,title,normalizeOptionValue(title,index),index + 1);
    }
  }
  private attachOptions(db: DatabaseSync, rows: any[]) {
    if (rows.length === 0) return [];
    const placeholders = rows.map(() => "?").join(",");
    const questionIds = rows.map((row) => row.id);
    const options = db.prepare(`SELECT id,question_id,title,value,"order" as [order] FROM question_option WHERE question_id IN (${placeholders}) ORDER BY question_id ASC, "order" ASC`).all(...questionIds) as any[];
    const optionsByQuestionId = new Map<number, any[]>();
    for (const option of options) {
      const current = optionsByQuestionId.get(option.question_id) ?? [];
      current.push(option);
      optionsByQuestionId.set(option.question_id, current);
    }
    return rows.map((row)=>({
      ...row,
      required:Boolean(row.required),
      created_at:toDate(row.created_at),
      updated_at:toDate(row.updated_at),
      options: optionsByQuestionId.get(row.id) ?? [],
    }));
  }
}

class SqliteConversationAnswerRepository implements ConversationAnswerRepository { constructor(private readonly db: DatabaseSync) {}
  async upsert(conversationId: number, questionId: number, answerValue: string | null): Promise<void> { this.db.prepare("INSERT INTO conversation_answer (conversation_id,question_id,answer_value,created_at) VALUES (?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(conversation_id,question_id) DO UPDATE SET answer_value=excluded.answer_value, created_at=CURRENT_TIMESTAMP").run(conversationId,questionId,answerValue); }
  async findByConversationId(conversationId: number) {
    const rows = this.db.prepare("SELECT q.id AS question_id,q.text,q.type,q.helper_text,q.required,q.\"order\" as [order],ca.answer_value FROM conversation_answer ca INNER JOIN question q ON q.id=ca.question_id WHERE ca.conversation_id=? ORDER BY q.\"order\" ASC").all(conversationId) as any[];
    if (rows.length === 0) return [];
    const placeholders = rows.map(() => "?").join(",");
    const questionIds = rows.map((row) => row.question_id);
    const options = this.db.prepare(`SELECT id,question_id,title,value,"order" as [order] FROM question_option WHERE question_id IN (${placeholders}) ORDER BY question_id ASC, "order" ASC`).all(...questionIds) as any[];
    const optionsByQuestionId = new Map<number, any[]>();
    for (const option of options) {
      const current = optionsByQuestionId.get(option.question_id) ?? [];
      current.push(option);
      optionsByQuestionId.set(option.question_id, current);
    }
    return rows.map((row)=>({
      ...row,
      required:Boolean(row.required),
      options: optionsByQuestionId.get(row.question_id) ?? [],
    }));
  }
}

class SqliteAppConfigRepository implements AppConfigRepository { constructor(private readonly db: DatabaseSync) {}
  async getConfigValue(key: string): Promise<string | null> { const row=this.db.prepare("SELECT config_value FROM app_config WHERE config_key=?").get(key) as {config_value:string}|undefined; return row?.config_value??null; }
  async setConfigValue(key: string, value: string, tx?: TransactionContext): Promise<void> { const db=tx?dbHandle(tx):this.db; db.prepare("INSERT INTO app_config (config_key,config_value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value, updated_at=CURRENT_TIMESTAMP").run(key,value); }
}

class SqliteGoogleOAuthTokenRepository implements GoogleOAuthTokenRepository { constructor(private readonly db: DatabaseSync) {}
  async getTokens(accountKey: string) { const row=this.db.prepare("SELECT access_token,refresh_token FROM google_oauth_token WHERE account_key=? LIMIT 1").get(accountKey) as {access_token:string|null;refresh_token:string}|undefined; return row?{accessToken:row.access_token,refreshToken:row.refresh_token}:null; }
  async upsertTokens(accountKey: string, accessToken: string | null, refreshToken: string | null): Promise<void> { const existing=this.db.prepare("SELECT refresh_token FROM google_oauth_token WHERE account_key=? LIMIT 1").get(accountKey) as {refresh_token:string|null}|undefined; const effective=refreshToken??existing?.refresh_token??null; if(!effective) throw new Error("Google OAuth did not return a refresh_token. Revoke app access in the Google account and authorize /api/auth/google again."); this.db.prepare("INSERT INTO google_oauth_token (account_key,access_token,refresh_token,updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(account_key) DO UPDATE SET access_token=COALESCE(excluded.access_token, google_oauth_token.access_token), refresh_token=excluded.refresh_token, updated_at=CURRENT_TIMESTAMP").run(accountKey,accessToken,effective); }
  async clearTokens(accountKey: string): Promise<void> { this.db.prepare("DELETE FROM google_oauth_token WHERE account_key=?").run(accountKey); }
  async hasTokens(accountKey: string): Promise<boolean> { const row=this.db.prepare("SELECT 1 AS c FROM google_oauth_token WHERE account_key=? AND refresh_token IS NOT NULL LIMIT 1").get(accountKey) as {c:number}|undefined; return row?.c===1; }
}

export class SqlitePersistenceProvider implements PersistenceProvider {
  readonly provider = "sqlite" as const;
  private db: DatabaseSync | null = null; private repositoriesRef: Repositories | null = null; private unitOfWorkRef: UnitOfWork | null = null;
  get repositories(): Repositories { if(!this.repositoriesRef) throw new Error("Persistence provider not connected."); return this.repositoriesRef; }
  get unitOfWork(): UnitOfWork { if(!this.unitOfWorkRef) throw new Error("Persistence provider not connected."); return this.unitOfWorkRef; }
  async connect(): Promise<void> { const filePath=process.env.SQLITE_FILE_PATH; if(!filePath) throw new Error("Missing required env var SQLITE_FILE_PATH when DB_PROVIDER=sqlite."); const resolvedPath=resolve(filePath); mkdirSync(dirname(resolvedPath),{recursive:true}); const db=new DatabaseSync(resolvedPath); db.exec("PRAGMA foreign_keys = ON"); db.exec(readFileSync(resolve(process.cwd(),"database/schema/sqlite.sql"),"utf8")); this.db=db; this.repositoriesRef={ articulator:new SqliteArticulatorRepository(db), conversation:new SqliteConversationRepository(db), question:new SqliteQuestionRepository(db), conversationAnswer:new SqliteConversationAnswerRepository(db), appConfig:new SqliteAppConfigRepository(db), googleOAuthToken:new SqliteGoogleOAuthTokenRepository(db)}; this.unitOfWorkRef=new SqliteUnitOfWork(db); console.info(`[DB] Connected to SQLite database at ${resolvedPath}`); }
  async close(): Promise<void> { if(!this.db) return; this.db.close(); this.db=null; this.repositoriesRef=null; this.unitOfWorkRef=null; console.info("[DB] SQLite connection closed"); }
}
