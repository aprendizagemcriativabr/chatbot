import type { IncomingMedia } from "./chatbot.base.service.js";
import type { ConversationStage } from "./conversation-state.service.js";

export type OrchestratorContext = {
  phoneNumber: string;
  messageType: string;
  messageBody: string;
  media: IncomingMedia | null;
  conversationId: number;
  stage: ConversationStage;
  currentQuestionOrder: number | null;
};

export type StageHandler = (context: OrchestratorContext) => Promise<boolean>;

export class ConversationOrchestratorService {
  private readonly handlers = new Map<ConversationStage, StageHandler>();

  register(stage: ConversationStage, handler: StageHandler): this {
    this.handlers.set(stage, handler);
    return this;
  }

  async handle(context: OrchestratorContext): Promise<boolean> {
    const handler = this.handlers.get(context.stage);
    if (!handler) {
      return false;
    }

    return handler(context);
  }
}
