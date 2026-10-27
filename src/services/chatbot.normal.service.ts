import { ChatbotBaseService, type IncomingMedia, type StoredQuestion } from "./chatbot.base.service";
import { ConversationOrchestratorService } from "./conversation-orchestrator.service.js";
import { conversationStateService } from "./conversation-state.service.js";
import { NormalAnswerValidatorService } from "./normal-answer-validator.service.js";
import { SubmissionCoordinatorService } from "./submission-coordinator.service.js";
import { appConfigService } from "./app-config.service.js";
import type { FormSaveResult } from "../repositories/index.js";

type MediaTrackingState = {
  rowIndex?: number;
  sheetName?: string;
  mediaItems: Array<{ link: string; id: string }>;
};

const MAX_MEDIA_PER_SUBMISSION = 5;

export class ChatbotNormalService extends ChatbotBaseService {
  private readonly mediaTrackingByConversation = new Map<number, MediaTrackingState>();

  private readonly validator = new NormalAnswerValidatorService(
    (value) => this.isOptionalSkipMessage(value),
    (question) => this.getSelectionOptions(question),
    (answer, optionsCount) => this.parseSingleSelectIndex(answer, optionsCount),
    (answer, optionsCount) => this.parseMultiSelectIndices(answer, optionsCount),
  );

  private readonly submissionCoordinator = new SubmissionCoordinatorService({
    sendMessage: (phoneNumber, message) => this.sendMessage(phoneNumber, message),
    isConfirmMessage: (body) => this.isConfirmMessage(body),
    isRejectMessage: (body) => this.isRejectMessage(body),
    submitConversationToSheets: (phoneNumber, conversationId, source) =>
      this.submitConversationToSheets(phoneNumber, conversationId, source),
    updateStageToAwaitingMedia: (conversationId) =>
      conversationStateService.updateStageAndQuestion(conversationId, "awaiting_media", null),
    cancelConversation: (conversationId) => conversationStateService.cancelConversation(conversationId),
    awaitingMediaMessage: () => this.getAwaitingMediaMessage(),
    confirmationHintMessage: () => this.getConfirmationHintMessage(),
    onConversationSubmitted: (conversationId, result) => {
      this.initializeMediaTracking(conversationId, result);
    },
  });

  private initializeMediaTracking(conversationId: number, saveResult: FormSaveResult): void {
    this.mediaTrackingByConversation.set(conversationId, {
      rowIndex: saveResult.rowIndex,
      mediaItems: [],
    });
  }

  private clearMediaTracking(conversationId: number): void {
    this.mediaTrackingByConversation.delete(conversationId);
  }

  private async appendMediaAndSyncSheets(params: {
    conversationId: number;
    phoneNumber: string;
    media: IncomingMedia;
  }): Promise<number> {
    const state = this.mediaTrackingByConversation.get(params.conversationId) ?? {
      mediaItems: [],
    };
    const contextFields = await this.getConversationFields(params.conversationId);
    const uploadResult = await this.saveIncomingMedia(
      params.phoneNumber,
      params.media,
      contextFields,
    );
    state.sheetName = await this.resolveActiveSheetName(state.sheetName);

    state.mediaItems.push({
      link: uploadResult.webViewLink ?? "",
      id: uploadResult.fileId,
    });

    const links = state.mediaItems.map((item) => item.link).join(";");
    const ids = state.mediaItems.map((item) => item.id).join(";");

    if (state.rowIndex) {
      await this.updateConversationMediaColumns({
        rowIndex: state.rowIndex,
        sheetName: state.sheetName,
        mediaLinks: links,
        mediaIds: ids,
      });
    }

    this.mediaTrackingByConversation.set(params.conversationId, state);
    return state.mediaItems.length;
  }

  private async resolveActiveSheetName(existing?: string): Promise<string | undefined> {
    if (existing) {
      return existing;
    }

    return (await appConfigService.getActiveSheetName()) ?? undefined;
  }

  formatQuestionAsText(question: StoredQuestion): string {
    return this.buildPromptMessage(question);
  }

  async processMessage(
    phoneNumber: string,
    messageType: string,
    messageBody: string,
    media?: IncomingMedia | null,
  ): Promise<void> {
    try {
      // 1. Verifica se o telefone está cadastrado como articulador ativo
      const articulatorId = await this.findArticulatorByPhone(phoneNumber);

      if (!articulatorId) {
        console.warn(`[ChatbotNormal] Access denied for phone=${phoneNumber}`);
        await this.sendMessage(phoneNumber, "Desculpe, você não está cadastrado como articulador. Entre em contato com a administração.");
        return;
      }

      const state = await conversationStateService.getOrCreateActiveConversation(articulatorId);
      const orchestrator = new ConversationOrchestratorService()
        .register("idle", async (context) => {
          if (this.isConfirmMessage(context.messageBody)) {
            const firstQuestion = await this.loadQuestionByOrder(1);
            if (!firstQuestion) {
              await this.sendMessage(
                context.phoneNumber,
                "Não há perguntas cadastradas no momento. Tente novamente mais tarde.",
              );
              return true;
            }

            await this.sendMessage(context.phoneNumber, this.formatQuestionAsText(firstQuestion));
            await conversationStateService.updateStageAndQuestion(
              context.conversationId,
              "awaiting_questions",
              1,
            );
            return true;
          }

          await this.sendMessage(context.phoneNumber, this.getStartMenuMessage());
          return true;
        })
        .register("awaiting_media", async (context) => {
          if (context.media) {
            if (context.media.type === "video") {
              return true;
            }

            const mediaCount = await this.appendMediaAndSyncSheets({
              conversationId: context.conversationId,
              phoneNumber: context.phoneNumber,
              media: context.media,
            });

            if (mediaCount >= MAX_MEDIA_PER_SUBMISSION) {
              await this.sendMessage(
                context.phoneNumber,
                "Limite de 5 imagens atingido. Envio finalizado. Obrigado pelo registro!",
              );
              this.clearMediaTracking(context.conversationId);
              await conversationStateService.updateStageAndQuestion(context.conversationId, "idle", null);
              return true;
            }

            await this.sendMessage(
              context.phoneNumber,
              `Imagem recebida (${mediaCount}/${MAX_MEDIA_PER_SUBMISSION}). Envie mais imagens ou '-' para finalizar.`,
            );
            return true;
          }

          if (this.isSkipMediaMessage(context.messageBody)) {
            const tracked = this.mediaTrackingByConversation.get(context.conversationId);
            const uploadedCount = tracked?.mediaItems.length ?? 0;
            const finishMessage =
              uploadedCount > 0
                ? `Envio de mídia finalizado com ${uploadedCount} imagem(ns). Obrigado pelo registro!`
                : "Envio de mídia pulado. Obrigado pelo registro!";
            await this.sendMessage(context.phoneNumber, finishMessage);
            this.clearMediaTracking(context.conversationId);
            await conversationStateService.updateStageAndQuestion(context.conversationId, "idle", null);
            return true;
          }

          await this.sendMessage(context.phoneNumber, this.getAwaitingMediaMessage());
          return true;
        })
        .register("awaiting_confirmation", async (context) => {
          await this.submissionCoordinator.handleAwaitingConfirmation({
            phoneNumber: context.phoneNumber,
            conversationId: context.conversationId,
            messageBody: context.messageBody,
            media: context.media,
            source: "whatsapp-normal",
          });
          return true;
        })
        .register("awaiting_questions", async (context) => {
          if (this.isExplicitCancelMessage(context.messageBody)) {
            await this.sendMessage(
              context.phoneNumber,
              "Preenchimento cancelado. Se quiser recomeçar, é só me chamar novamente!",
            );
            await conversationStateService.cancelConversation(context.conversationId);
            return true;
          }

          const currentOrder = context.currentQuestionOrder ?? 1;
          const currentQuestion: StoredQuestion | null = await this.loadQuestionByOrder(currentOrder);
          if (!currentQuestion) {
            await this.sendMessage(context.phoneNumber, "Ocorreu um erro. Vamos recomeçar.");
            await conversationStateService.updateStageAndQuestion(context.conversationId, "idle", null);
            return true;
          }

          if (context.media) {
            await this.sendMessage(
              context.phoneNumber,
              "A mídia será solicitada no final do preenchimento. Agora responda a pergunta atual em texto.",
            );
            return true;
          }

          const validation = this.validator.validate(context.messageBody, context.messageType, currentQuestion);
          if (!validation.valid) {
            await this.sendMessage(context.phoneNumber, `⚠️ ${validation.error}\n\nTente novamente:`);
            return true;
          }

          await this.saveAnswer(context.conversationId, currentQuestion.id, validation.value);
          const nextQuestion = await this.loadQuestionByOrder(currentOrder + 1);
          if (nextQuestion) {
            await this.sendMessage(context.phoneNumber, this.formatQuestionAsText(nextQuestion));
            await conversationStateService.updateStageAndQuestion(
              context.conversationId,
              "awaiting_questions",
              currentOrder + 1,
            );
            return true;
          }

          await this.sendConfirmationRequest(context.phoneNumber, context.conversationId);
          await conversationStateService.updateStageAndQuestion(
            context.conversationId,
            "awaiting_confirmation",
            null,
          );
          return true;
        });

      await orchestrator.handle({
        phoneNumber,
        messageType,
        messageBody,
        media: media ?? null,
        conversationId: state.conversationId,
        stage: state.stage,
        currentQuestionOrder: state.currentQuestionOrder,
      });

    } catch (error) {
      console.error("[ChatbotNormal] Erro ao processar mensagem:", error);
    }
  }
}

export const chatbotNormalService = new ChatbotNormalService();
