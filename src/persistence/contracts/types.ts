import type { QuestionInput, QuestionType } from "../../schemas/question.schema.js";
import type { ArticulatorInput } from "../../schemas/articulator.schema.js";
import type { ConversationStage } from "../../services/conversation-state.service.js";

export type DbProvider = "sqlserver" | "sqlite";

export type TransactionContext = {
  provider: DbProvider;
  handle: unknown;
};

export interface UnitOfWork {
  withTransaction<T>(operation: (tx: TransactionContext) => Promise<T>): Promise<T>;
}

export type ArticulatorRecord = {
  id: number;
  name: string;
  phone: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type QuestionRecord = {
  id: number;
  text: string;
  type: QuestionType;
  helper_text: string | null;
  required: boolean;
  order: number;
  created_at: Date;
  updated_at: Date;
  options: QuestionOptionRecord[];
};

export type QuestionOptionRecord = {
  id: number;
  question_id: number;
  title: string;
  value: string;
  order: number;
};

export type ConversationRecord = {
  id: number;
  stage: ConversationStage;
  current_question_order: number | null;
};

export type ConversationAnswerWithQuestionRecord = {
  question_id: number;
  text: string;
  type: QuestionType;
  helper_text: string | null;
  required: boolean;
  order: number;
  options: QuestionOptionRecord[];
  answer_value: string | null;
};

export interface ArticulatorRepository {
  existsActiveByPhone(phone: string): Promise<boolean>;
  listActive(): Promise<Omit<ArticulatorRecord, "deleted_at">[]>;
  findActiveIdByPhone(phone: string): Promise<number | null>;
  findActiveNameByPhone(phone: string): Promise<string | null>;
  findActive(tx: TransactionContext): Promise<Omit<ArticulatorRecord, "deleted_at">[]>;
  findByPhones(tx: TransactionContext, phones: string[]): Promise<ArticulatorRecord[]>;
  softDeleteByPhones(tx: TransactionContext, phones: string[]): Promise<void>;
  insert(tx: TransactionContext, articulator: ArticulatorInput): Promise<void>;
  reactivate(tx: TransactionContext, articulatorId: number, name: string): Promise<void>;
  updateName(tx: TransactionContext, articulatorId: number, name: string): Promise<void>;
}

export interface ConversationRepository {
  findActiveByArticulatorId(articulatorId: number): Promise<ConversationRecord | null>;
  create(articulatorId: number, stage: ConversationStage): Promise<number>;
  updateStage(conversationId: number, stage: ConversationStage): Promise<void>;
  updateStageAndQuestion(
    conversationId: number,
    stage: ConversationStage,
    currentQuestionOrder: number | null,
  ): Promise<void>;
  deleteConversationAndAnswers(conversationId: number): Promise<void>;
}

export interface QuestionRepository {
  listAll(): Promise<QuestionRecord[]>;
  findAll(tx: TransactionContext): Promise<QuestionRecord[]>;
  findByOrder(order: number): Promise<QuestionRecord | null>;
  deleteAll(tx: TransactionContext): Promise<void>;
  insert(tx: TransactionContext, question: QuestionInput): Promise<void>;
}

export interface ConversationAnswerRepository {
  upsert(conversationId: number, questionId: number, answerValue: string | null): Promise<void>;
  findByConversationId(conversationId: number): Promise<ConversationAnswerWithQuestionRecord[]>;
}

export interface AppConfigRepository {
  getConfigValue(key: string): Promise<string | null>;
  setConfigValue(key: string, value: string, tx?: TransactionContext): Promise<void>;
}

export interface GoogleOAuthTokenRepository {
  getTokens(accountKey: string): Promise<{ accessToken: string | null; refreshToken: string } | null>;
  upsertTokens(
    accountKey: string,
    accessToken: string | null,
    refreshToken: string | null,
  ): Promise<void>;
  clearTokens(accountKey: string): Promise<void>;
  hasTokens(accountKey: string): Promise<boolean>;
}

export interface Repositories {
  articulator: ArticulatorRepository;
  conversation: ConversationRepository;
  question: QuestionRepository;
  conversationAnswer: ConversationAnswerRepository;
  appConfig: AppConfigRepository;
  googleOAuthToken: GoogleOAuthTokenRepository;
}

export interface PersistenceProvider {
  readonly provider: DbProvider;
  readonly repositories: Repositories;
  readonly unitOfWork: UnitOfWork;
  connect(): Promise<void>;
  close(): Promise<void>;
}
