import type { IncomingMedia } from "./chatbot.base.service.js";
import type { FormSaveResult } from "../repositories/index.js";

export type ConfirmationDependencies = {
  sendMessage: (phoneNumber: string, message: string) => Promise<void>;
  isConfirmMessage: (body: string) => boolean;
  isRejectMessage: (body: string) => boolean;
  submitConversationToSheets: (phoneNumber: string, conversationId: number, source: string) => Promise<FormSaveResult>;
  updateStageToAwaitingMedia: (conversationId: number) => Promise<void>;
  cancelConversation: (conversationId: number) => Promise<void>;
  awaitingMediaMessage: () => string;
  confirmationHintMessage: () => string;
  onConversationSubmitted: (conversationId: number, result: FormSaveResult) => void;
};

export type ConfirmationResult = "handled" | "unhandled";

export class SubmissionCoordinatorService {
  constructor(private readonly deps: ConfirmationDependencies) {}

  async handleAwaitingConfirmation(params: {
    phoneNumber: string;
    conversationId: number;
    messageBody: string;
    media: IncomingMedia | null;
    source: string;
  }): Promise<ConfirmationResult> {
    if (this.deps.isRejectMessage(params.messageBody)) {
      await this.deps.sendMessage(
        params.phoneNumber,
        "Preenchimento descartado. Se quiser recomeçar, é só me chamar novamente!",
      );
      await this.deps.cancelConversation(params.conversationId);
      return "handled";
    }

    if (params.media) {
      await this.deps.sendMessage(
        params.phoneNumber,
        "Recebi a midia, mas primeiro preciso da confirmacao dos dados.\n\n*Confirmacao de envio*\n" +
          this.deps.confirmationHintMessage(),
      );
      return "handled";
    }

    if (!this.deps.isConfirmMessage(params.messageBody)) {
      await this.deps.sendMessage(
        params.phoneNumber,
        "Nao entendi sua resposta.\n\n*Confirmacao de envio*\n" + this.deps.confirmationHintMessage(),
      );
      return "handled";
    }

    const saveResult = await this.deps.submitConversationToSheets(
      params.phoneNumber,
      params.conversationId,
      params.source,
    );
    this.deps.onConversationSubmitted(params.conversationId, saveResult);

    await this.deps.sendMessage(
      params.phoneNumber,
      "Dados registrados com sucesso.\n\n" + this.deps.awaitingMediaMessage(),
    );

    await this.deps.updateStageToAwaitingMedia(params.conversationId);
    return "handled";
  }
}
