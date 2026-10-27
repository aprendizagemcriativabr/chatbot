import { persistenceProvider } from "../persistence/index.js";

export type ConversationStage =
  | "idle"
  | "awaiting_questions"
  | "awaiting_confirmation"
  | "awaiting_media";

export type ConversationState = {
  articulatorId: number;
  conversationId: number;
  stage: ConversationStage;
  currentQuestionOrder: number | null;
};

export class ConversationStateService {
  async getOrCreateActiveConversation(articulatorId: number): Promise<ConversationState> {
    const existing = await persistenceProvider.repositories.conversation.findActiveByArticulatorId(articulatorId);

    if (existing) {
      return {
        articulatorId,
        conversationId: existing.id,
        stage: existing.stage,
        currentQuestionOrder: existing.current_question_order,
      };
    }

    const conversationId = await persistenceProvider.repositories.conversation.create(articulatorId, "idle");
    return { articulatorId, conversationId, stage: "idle", currentQuestionOrder: null };
  }

  async updateStage(conversationId: number, stage: ConversationStage): Promise<void> {
    await persistenceProvider.repositories.conversation.updateStage(conversationId, stage);
  }

  async updateStageAndQuestion(
    conversationId: number,
    stage: ConversationStage,
    currentQuestionOrder: number | null,
  ): Promise<void> {
    await persistenceProvider.repositories.conversation.updateStageAndQuestion(
      conversationId,
      stage,
      currentQuestionOrder,
    );
  }

  async cancelConversation(conversationId: number): Promise<void> {
    await persistenceProvider.repositories.conversation.deleteConversationAndAnswers(conversationId);
  }
}

export const conversationStateService = new ConversationStateService();
