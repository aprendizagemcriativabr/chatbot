import sql from "mssql";

import { SqlServerDatabase } from "./sqlserver.database.js";
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

function txHandle(tx: TransactionContext): sql.Transaction {
  return tx.handle as sql.Transaction;
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

class SqlServerUnitOfWork implements UnitOfWork {
  async withTransaction<T>(operation: (tx: TransactionContext) => Promise<T>): Promise<T> {
    const transaction = new sql.Transaction(SqlServerDatabase.getPool());
    await transaction.begin();

    try {
      const result = await operation({ provider: "sqlserver", handle: transaction });
      await transaction.commit();
      return result;
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        // no-op
      }
      throw error;
    }
  }
}

class SqlServerArticulatorRepository implements ArticulatorRepository {
  async existsActiveByPhone(phone: string): Promise<boolean> {
    const result = await SqlServerDatabase.getPool().request()
      .input("phone", sql.VarChar(13), phone)
      .query<{ exists: number }>(`SELECT TOP 1 1 AS [exists] FROM articulator WHERE phone = @phone AND deleted_at IS NULL`);

    return result.recordset.length > 0 && result.recordset[0]?.exists === 1;
  }

  async listActive() {
    const result = await SqlServerDatabase.getPool().request().query(`
      SELECT id, name, phone, created_at, updated_at
      FROM articulator
      WHERE deleted_at IS NULL
      ORDER BY name ASC
    `);

    return result.recordset;
  }

  async findActiveIdByPhone(phone: string): Promise<number | null> {
    const result = await SqlServerDatabase.getPool().request()
      .input("phone", sql.VarChar(13), phone)
      .query<{ id: number }>(`SELECT TOP 1 id FROM articulator WHERE phone = @phone AND deleted_at IS NULL`);

    return result.recordset[0]?.id ?? null;
  }

  async findActiveNameByPhone(phone: string): Promise<string | null> {
    const result = await SqlServerDatabase.getPool().request()
      .input("phone", sql.VarChar(13), phone)
      .query<{ name: string }>(`SELECT TOP 1 name FROM articulator WHERE phone = @phone AND deleted_at IS NULL`);

    return result.recordset[0]?.name ?? null;
  }

  async findActive(tx: TransactionContext) {
    const result = await new sql.Request(txHandle(tx)).query(`
      SELECT id, name, phone, created_at, updated_at
      FROM articulator
      WHERE deleted_at IS NULL
      ORDER BY name ASC
    `);

    return result.recordset;
  }

  async findByPhones(tx: TransactionContext, phones: string[]) {
    if (phones.length === 0) {
      return [];
    }

    const request = new sql.Request(txHandle(tx));
    const placeholders = phones.map((phone, index) => {
      const key = `phone${index}`;
      request.input(key, sql.VarChar(13), phone);
      return `@${key}`;
    });

    const result = await request.query(`
      SELECT id, name, phone, created_at, updated_at, deleted_at
      FROM articulator
      WHERE phone IN (${placeholders.join(",")})
    `);

    return result.recordset;
  }

  async softDeleteByPhones(tx: TransactionContext, phones: string[]): Promise<void> {
    if (phones.length === 0) {
      return;
    }

    const request = new sql.Request(txHandle(tx));
    const placeholders = phones.map((phone, index) => {
      const key = `phone${index}`;
      request.input(key, sql.VarChar(13), phone);
      return `@${key}`;
    });

    await request.query(`
      UPDATE articulator
      SET deleted_at = GETUTCDATE(), updated_at = GETUTCDATE()
      WHERE deleted_at IS NULL
        AND phone IN (${placeholders.join(",")})
    `);
  }

  async insert(tx: TransactionContext, articulator: { name: string; phone: string }): Promise<void> {
    await new sql.Request(txHandle(tx))
      .input("name", sql.VarChar(100), articulator.name)
      .input("phone", sql.VarChar(13), articulator.phone)
      .query(`
        INSERT INTO articulator (name, phone, created_at, updated_at, deleted_at)
        VALUES (@name, @phone, GETUTCDATE(), GETUTCDATE(), NULL)
      `);
  }

  async reactivate(tx: TransactionContext, articulatorId: number, name: string): Promise<void> {
    await new sql.Request(txHandle(tx))
      .input("articulatorId", sql.Int, articulatorId)
      .input("name", sql.VarChar(100), name)
      .query(`UPDATE articulator SET name = @name, deleted_at = NULL, updated_at = GETUTCDATE() WHERE id = @articulatorId`);
  }

  async updateName(tx: TransactionContext, articulatorId: number, name: string): Promise<void> {
    await new sql.Request(txHandle(tx))
      .input("articulatorId", sql.Int, articulatorId)
      .input("name", sql.VarChar(100), name)
      .query(`UPDATE articulator SET name = @name, updated_at = GETUTCDATE() WHERE id = @articulatorId`);
  }
}

class SqlServerConversationRepository implements ConversationRepository {
  async findActiveByArticulatorId(articulatorId: number) {
    const result = await SqlServerDatabase.getPool().request()
      .input("articulator_id", sql.Int, articulatorId)
      .query(`SELECT TOP 1 id, stage, current_question_order FROM conversation WHERE articulator_id = @articulator_id AND deleted_at IS NULL`);

    return result.recordset[0] ?? null;
  }

  async create(articulatorId: number, stage: string): Promise<number> {
    const result = await SqlServerDatabase.getPool().request()
      .input("articulator_id", sql.Int, articulatorId)
      .input("stage", sql.VarChar(30), stage)
      .query<{ id: number }>(`INSERT INTO conversation (articulator_id, stage) OUTPUT INSERTED.id VALUES (@articulator_id, @stage)`);

    return result.recordset[0].id;
  }

  async updateStage(conversationId: number, stage: string): Promise<void> {
    await SqlServerDatabase.getPool().request()
      .input("id", sql.Int, conversationId)
      .input("stage", sql.VarChar(30), stage)
      .query(`UPDATE conversation SET stage = @stage, updated_at = GETUTCDATE() WHERE id = @id`);
  }

  async updateStageAndQuestion(conversationId: number, stage: string, currentQuestionOrder: number | null): Promise<void> {
    await SqlServerDatabase.getPool().request()
      .input("id", sql.Int, conversationId)
      .input("stage", sql.VarChar(30), stage)
      .input("current_question_order", sql.Int, currentQuestionOrder)
      .query(`UPDATE conversation SET stage = @stage, current_question_order = @current_question_order, updated_at = GETUTCDATE() WHERE id = @id`);
  }

  async deleteConversationAndAnswers(conversationId: number): Promise<void> {
    await SqlServerDatabase.getPool().request()
      .input("id", sql.Int, conversationId)
      .query(`DELETE FROM conversation_answer WHERE conversation_id = @id; DELETE FROM conversation WHERE id = @id;`);
  }
}

class SqlServerQuestionRepository implements QuestionRepository {
  async listAll() {
    const result = await SqlServerDatabase.getPool().request().query(`
      SELECT id, text, type, helper_text, required, [order], created_at, updated_at
      FROM question
      ORDER BY [order] ASC
    `);

    return this.attachOptions(result.recordset);
  }

  async findAll(tx: TransactionContext) {
    const result = await new sql.Request(txHandle(tx)).query(`
      SELECT id, text, type, helper_text, required, [order], created_at, updated_at
      FROM question
      ORDER BY [order] ASC
    `);

    return this.attachOptions(result.recordset, tx);
  }

  async findByOrder(order: number) {
    const result = await SqlServerDatabase.getPool().request()
      .input("order", sql.Int, order)
      .query(`
        SELECT TOP 1 id, text, type, helper_text, required, [order], created_at, updated_at
        FROM question
        WHERE [order] = @order
      `);

    const questions = await this.attachOptions(result.recordset);
    return questions[0] ?? null;
  }

  async deleteAll(tx: TransactionContext): Promise<void> {
    await new sql.Request(txHandle(tx)).query("DELETE FROM question_option; DELETE FROM question");
  }

  async insert(tx: TransactionContext, question: QuestionInput): Promise<void> {
    const requiredValue = Number(question.required ?? true);

    const result = await new sql.Request(txHandle(tx))
      .input("text", sql.NVarChar(sql.MAX), question.text)
      .input("type", sql.VarChar(30), question.type)
      .input("helper_text", sql.NVarChar(sql.MAX), question.helperText ?? null)
      .input("required", sql.Bit, requiredValue)
      .input("order", sql.Int, question.order)
      .query<{ id: number }>(`
        INSERT INTO question (text, type, helper_text, required, [order], created_at, updated_at)
        OUTPUT INSERTED.id
        VALUES (@text, @type, @helper_text, @required, @order, GETUTCDATE(), GETUTCDATE())
      `);

    const questionId = result.recordset[0]?.id;
    if (!questionId || question.type === "text") {
      return;
    }

    const options = question.options ?? [];
    for (let index = 0; index < options.length; index += 1) {
      const title = options[index].trim();
      await new sql.Request(txHandle(tx))
        .input("question_id", sql.Int, questionId)
        .input("title", sql.NVarChar(sql.MAX), title)
        .input("value", sql.NVarChar(255), normalizeOptionValue(title, index))
        .input("order", sql.Int, index + 1)
        .query(`
          INSERT INTO question_option (question_id, title, value, [order], created_at, updated_at)
          VALUES (@question_id, @title, @value, @order, GETUTCDATE(), GETUTCDATE())
        `);
    }
  }

  private async attachOptions(
    questions: any[],
    tx?: TransactionContext,
  ) {
    if (questions.length === 0) {
      return [];
    }

    const request = tx ? new sql.Request(txHandle(tx)) : SqlServerDatabase.getPool().request();
    const placeholders = questions.map((question, index) => {
      const key = `questionId${index}`;
      request.input(key, sql.Int, question.id);
      return `@${key}`;
    });

    const result = await request.query(`
      SELECT id, question_id, title, value, [order]
      FROM question_option
      WHERE question_id IN (${placeholders.join(",")})
      ORDER BY question_id ASC, [order] ASC
    `);

    const optionsByQuestionId = new Map<number, any[]>();
    for (const option of result.recordset) {
      const current = optionsByQuestionId.get(option.question_id) ?? [];
      current.push(option);
      optionsByQuestionId.set(option.question_id, current);
    }

    return questions.map((question) => ({
      ...question,
      required: Boolean(question.required),
      options: optionsByQuestionId.get(question.id) ?? [],
    }));
  }
}

class SqlServerConversationAnswerRepository implements ConversationAnswerRepository {
  async upsert(conversationId: number, questionId: number, answerValue: string | null): Promise<void> {
    await SqlServerDatabase.getPool().request()
      .input("conv_id", sql.Int, conversationId)
      .input("q_id", sql.Int, questionId)
      .input("ans_val", sql.NVarChar(sql.MAX), answerValue)
      .query(`
        UPDATE conversation_answer
        SET answer_value = @ans_val, created_at = GETUTCDATE()
        WHERE conversation_id = @conv_id AND question_id = @q_id;

        IF @@ROWCOUNT = 0
        BEGIN
          INSERT INTO conversation_answer (conversation_id, question_id, answer_value)
          VALUES (@conv_id, @q_id, @ans_val);
        END
      `);
  }

  async findByConversationId(conversationId: number) {
    const result = await SqlServerDatabase.getPool().request()
      .input("conversation_id", sql.Int, conversationId)
      .query(`
        SELECT q.id AS question_id, q.text, q.type, q.helper_text, q.required, q.[order], ca.answer_value
        FROM conversation_answer ca
        INNER JOIN question q ON q.id = ca.question_id
        WHERE ca.conversation_id = @conversation_id
        ORDER BY q.[order] ASC
      `);

    const rows = result.recordset;
    if (rows.length === 0) {
      return [];
    }

    const optionsRequest = SqlServerDatabase.getPool().request();
    const placeholders = rows.map((row, index) => {
      const key = `questionId${index}`;
      optionsRequest.input(key, sql.Int, row.question_id);
      return `@${key}`;
    });

    const optionsResult = await optionsRequest.query(`
      SELECT id, question_id, title, value, [order]
      FROM question_option
      WHERE question_id IN (${placeholders.join(",")})
      ORDER BY question_id ASC, [order] ASC
    `);

    const optionsByQuestionId = new Map<number, any[]>();
    for (const option of optionsResult.recordset) {
      const current = optionsByQuestionId.get(option.question_id) ?? [];
      current.push(option);
      optionsByQuestionId.set(option.question_id, current);
    }

    return rows.map((row) => ({
      ...row,
      required: Boolean(row.required),
      options: optionsByQuestionId.get(row.question_id) ?? [],
    }));
  }
}

class SqlServerAppConfigRepository implements AppConfigRepository {
  async getConfigValue(key: string): Promise<string | null> {
    const result = await SqlServerDatabase.getPool().request()
      .input("key", sql.VarChar(50), key)
      .query<{ config_value: string }>(`SELECT config_value FROM dbo.app_config WHERE config_key = @key`);

    return result.recordset[0]?.config_value ?? null;
  }

  async setConfigValue(key: string, value: string, tx?: TransactionContext): Promise<void> {
    const request = tx ? new sql.Request(txHandle(tx)) : SqlServerDatabase.getPool().request();

    await request
      .input("key", sql.VarChar(50), key)
      .input("value", sql.VarChar(255), value)
      .query(`
        IF EXISTS (SELECT 1 FROM dbo.app_config WHERE config_key = @key)
        BEGIN
          UPDATE dbo.app_config
          SET config_value = @value, updated_at = GETUTCDATE()
          WHERE config_key = @key;
        END
        ELSE
        BEGIN
          INSERT INTO dbo.app_config (config_key, config_value, updated_at)
          VALUES (@key, @value, GETUTCDATE());
        END
      `);
  }
}

class SqlServerGoogleOAuthTokenRepository implements GoogleOAuthTokenRepository {
  async getTokens(accountKey: string) {
    const result = await SqlServerDatabase.getPool().request()
      .input("accountKey", sql.VarChar(50), accountKey)
      .query<{ access_token: string | null; refresh_token: string }>(`SELECT TOP 1 access_token, refresh_token FROM google_oauth_token WHERE account_key = @accountKey`);

    const row = result.recordset[0];
    if (!row) {
      return null;
    }

    return { accessToken: row.access_token, refreshToken: row.refresh_token };
  }

  async upsertTokens(accountKey: string, accessToken: string | null, refreshToken: string | null): Promise<void> {
    const request = SqlServerDatabase.getPool().request();
    await request
      .input("accountKey", sql.VarChar(50), accountKey)
      .input("accessToken", sql.NVarChar(sql.MAX), accessToken)
      .input("refreshToken", sql.NVarChar(sql.MAX), refreshToken)
      .query(`
        DECLARE @existingRefreshToken NVARCHAR(MAX);
        DECLARE @effectiveRefreshToken NVARCHAR(MAX);

        SELECT @existingRefreshToken = refresh_token
        FROM google_oauth_token
        WHERE account_key = @accountKey;

        SET @effectiveRefreshToken = COALESCE(@refreshToken, @existingRefreshToken);

        IF @effectiveRefreshToken IS NULL
        BEGIN
          THROW 50001, 'Google OAuth did not return a refresh_token. Revoke app access in the Google account and authorize /api/auth/google again.', 1;
        END;

        IF EXISTS (SELECT 1 FROM google_oauth_token WHERE account_key = @accountKey)
        BEGIN
          UPDATE google_oauth_token
          SET access_token = COALESCE(@accessToken, access_token), refresh_token = @effectiveRefreshToken, updated_at = GETUTCDATE()
          WHERE account_key = @accountKey;
        END
        ELSE
        BEGIN
          INSERT INTO google_oauth_token (account_key, access_token, refresh_token, updated_at)
          VALUES (@accountKey, @accessToken, @effectiveRefreshToken, GETUTCDATE());
        END;
      `);
  }

  async clearTokens(accountKey: string): Promise<void> {
    await SqlServerDatabase.getPool().request()
      .input("accountKey", sql.VarChar(50), accountKey)
      .query(`DELETE FROM google_oauth_token WHERE account_key = @accountKey`);
  }

  async hasTokens(accountKey: string): Promise<boolean> {
    const result = await SqlServerDatabase.getPool().request()
      .input("accountKey", sql.VarChar(50), accountKey)
      .query<{ connected: boolean }>(`SELECT TOP 1 CAST(1 AS BIT) AS connected FROM google_oauth_token WHERE account_key = @accountKey AND refresh_token IS NOT NULL`);

    return Boolean(result.recordset[0]?.connected);
  }
}

export class SqlServerPersistenceProvider implements PersistenceProvider {
  readonly provider = "sqlserver" as const;

  readonly unitOfWork: UnitOfWork = new SqlServerUnitOfWork();

  readonly repositories: Repositories = {
    articulator: new SqlServerArticulatorRepository(),
    conversation: new SqlServerConversationRepository(),
    question: new SqlServerQuestionRepository(),
    conversationAnswer: new SqlServerConversationAnswerRepository(),
    appConfig: new SqlServerAppConfigRepository(),
    googleOAuthToken: new SqlServerGoogleOAuthTokenRepository(),
  };

  async connect(): Promise<void> {
    await SqlServerDatabase.connect();
  }

  async close(): Promise<void> {
    await SqlServerDatabase.close();
  }
}
