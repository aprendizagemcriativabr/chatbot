import axios from "axios";

import { persistenceProvider } from "../persistence/index.js";
import type { FormFields, MediaUploadResult } from "../repositories/index.js";
import { getEventStorageService } from "./event-storage.service.js";
import { getWhatsAppMediaService } from "./whatsapp-media.service.js";
import { appConfigService } from "./app-config.service.js";
import type { QuestionType } from "../schemas/question.schema.js";
import type { FormSaveResult } from "../repositories/index.js";

export type IncomingMedia = {
  id: string;
  type: "image" | "video";
  caption?: string;
};

export type StoredQuestion = {
  id: number;
  text: string;
  type: QuestionType;
  helperText: string | null;
  required: boolean;
  order: number;
  options: SelectionOption[];
};

type ConversationAnswer = StoredQuestion & {
  answerValue: unknown;
  title: string;
  displayValue: string;
};

type SelectionOption = {
  value: string;
  title: string;
};

function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function parseFoldersFromCaption(caption: string | undefined): {
  nucleo?: string;
  iniciativa?: string;
} {
  if (!caption) {
    return {};
  }

  const taggedMatch = caption.match(
    /nucleo\s*[:=]\s*(.+?)\s*[;,|]\s*iniciativa\s*[:=]\s*(.+)$/i,
  );

  if (taggedMatch) {
    return {
      nucleo: taggedMatch[1].trim() || undefined,
      iniciativa: taggedMatch[2].trim() || undefined,
    };
  }

  const slashParts = caption.split("/").map((part) => part.trim());
  if (slashParts.length >= 2 && slashParts[0] && slashParts[1]) {
    return {
      nucleo: slashParts[0],
      iniciativa: slashParts.slice(1).join("/"),
    };
  }

  return {};
}

export abstract class ChatbotBaseService {
  constructor(
    private readonly eventStorageService = getEventStorageService(),
    private readonly whatsAppMediaService = getWhatsAppMediaService(),
  ) {}

  protected buildPromptMessage(question: StoredQuestion): string {
    const title = this.getQuestionTitle(question);
    const description = this.getQuestionDescription(question);
    const blocks: string[] = [`*${title}*`];

    if (description) {
      blocks.push(`_${description}_`);
    }

    if (question.type === "single_choice") {
      blocks.push(this.buildSelectionMenu(question));
      blocks.push("_Envie apenas o numero da opcao desejada._");
    }

    if (question.type === "multiple_choice") {
      blocks.push(this.buildSelectionMenu(question));
      blocks.push("_Voce pode escolher mais de uma opcao. Envie os numeros separados por virgula (ex: 1,3,5)._");
    }

    if (question.required === false) {
      blocks.push("_Digite '-' caso deseje pular a pergunta._");
    }

    return blocks.join("\n\n");
  }

  protected getStartMenuMessage(): string {
    return (
      "*Boletim RBAC*\n\n" +
      "_Tudo pronto para iniciarmos?_\n\n" +
      "*1.* Iniciar preenchimento\n" +
      "*2.* Cancelar\n\n" +
      "_Voce pode enviar CANCELAR a qualquer momento para encerrar._"
    );
  }

  protected getAwaitingMediaMessage(): string {
    return (
      "*Envio de midia*\n\n" +
      "_Envie somente imagens do encontro (maximo de 5)._\n\n" +
      "_Envie '-' para finalizar ou pular._"
    );
  }

  protected getConfirmationHintMessage(): string {
    return "*1.* Confirmar e enviar\n*2.* Cancelar e descartar";
  }

  protected isOptionalSkipMessage(messageBody: string): boolean {
    const command = normalizeKey(messageBody);
    return command === "-" || command === "pular";
  }

  protected parseSingleSelectIndex(answer: string, optionsCount: number): number | null {
    const index = Number.parseInt(answer.trim(), 10);
    if (Number.isNaN(index) || index < 1 || index > optionsCount) {
      return null;
    }

    return index - 1;
  }

  protected parseMultiSelectIndices(answer: string, optionsCount: number): number[] | null {
    const tokens = answer.split(",").map((item) => item.trim()).filter(Boolean);
    if (tokens.length === 0) {
      return null;
    }

    const uniqueIndices: number[] = [];
    const seen = new Set<number>();

    for (const token of tokens) {
      const rawIndex = Number.parseInt(token, 10);
      if (Number.isNaN(rawIndex) || rawIndex < 1 || rawIndex > optionsCount) {
        return null;
      }

      const normalizedIndex = rawIndex - 1;
      if (!seen.has(normalizedIndex)) {
        seen.add(normalizedIndex);
        uniqueIndices.push(normalizedIndex);
      }
    }

    return uniqueIndices;
  }

  protected getSelectionOptions(question: StoredQuestion): SelectionOption[] {
    return question.options;
  }

  /**
   * Busca o articulador pelo telefone.
   * Retorna o ID se encontrado e ativo, ou null caso contrário.
   */

  protected async findArticulatorByPhone(
    phoneNumber: string,
  ): Promise<number | null> {
    return persistenceProvider.repositories.articulator.findActiveIdByPhone(phoneNumber);
  }

  protected async findArticulatorNameByPhone(
    phoneNumber: string,
  ): Promise<string | null> {
    return persistenceProvider.repositories.articulator.findActiveNameByPhone(phoneNumber);
  }

  protected async loadQuestionByOrder(order: number): Promise<StoredQuestion | null> {
    const row = await persistenceProvider.repositories.question.findByOrder(order);
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      text: row.text,
      type: row.type,
      helperText: row.helper_text,
      required: row.required,
      order: row.order,
      options: row.options.map((option) => ({
        value: option.value,
        title: option.title,
      })),
    };
  }

  /**
   * Salva a resposta no banco de dados.
   * Usa UPSERT para permitir sobrescrever resposta em uma conversa ativa.
   */
  protected async saveAnswer(
    conversationId: number,
    questionId: number,
    answerValue: unknown,
  ): Promise<void> {
    const stringValue = answerValue === null ? null : JSON.stringify(answerValue);
    await persistenceProvider.repositories.conversationAnswer.upsert(conversationId, questionId, stringValue);
  }

  protected async getConversationFields(conversationId: number): Promise<FormFields> {
    const answers = await this.getConversationAnswers(conversationId);
    return this.buildFieldsFromAnswers(answers);
  }

  protected async sendConfirmationRequest(
    phoneNumber: string,
    conversationId: number,
  ): Promise<void> {
    const answers = await this.getConversationAnswers(conversationId);
    const summaryLines = answers.map(
      (answer) => `${answer.order}. *${answer.title}*: ${answer.displayValue}`,
    );

    const message =
      "*Confira os dados antes do envio:*\n\n" +
      summaryLines.join("\n") +
      "\n\n*Confirmacao de envio*\n" +
      this.getConfirmationHintMessage();

    await this.sendMessage(phoneNumber, message);
  }

  protected async submitConversationToSheets(
    phoneNumber: string,
    conversationId: number,
    source: string,
  ): Promise<FormSaveResult> {
    const fields = await this.getConversationFields(conversationId);
    const sheetName = await appConfigService.getActiveSheetName();
    const articulatorName = await this.findArticulatorNameByPhone(phoneNumber);

    try {
      return await this.eventStorageService.saveForm({
        phone: phoneNumber,
        articulatorName: articulatorName ?? undefined,
        source,
        sheetName: sheetName ?? undefined,
        fields,
      });
    } catch (error) {
      console.error("Erro ao salvar formulário no EventStorageService:");
      if (axios.isAxiosError(error)) {
        console.error("Status:", error.response?.status);
        console.error("Dados:", error.response?.data);
        console.error("Mensagem:", error.message);
      }
      throw error;
    }
  }

  protected async saveIncomingMedia(
    phoneNumber: string,
    media: IncomingMedia,
    contextFields: FormFields = {},
  ): Promise<MediaUploadResult> {
    const mediaFile = await this.whatsAppMediaService.downloadMedia(media.id);
    const captionFolders = parseFoldersFromCaption(media.caption);
    const nucleo =
      captionFolders.nucleo ||
      this.getStringFieldValue(contextFields, [
        "nucleo",
        "núcleo",
        "nucleo regional",
        "núcleo regional",
      ]);
    const iniciativa =
      captionFolders.iniciativa ||
      this.getStringFieldValue(contextFields, [
        "iniciativa",
        "nome da iniciativa",
      ]);

    return this.eventStorageService.saveMedia({
      phone: phoneNumber,
      source: "whatsapp",
      nucleo,
      iniciativa,
      fileName: mediaFile.fileName,
      mimeType: mediaFile.mimeType,
      buffer: mediaFile.buffer,
    });
  }

  protected async updateConversationMediaColumns(input: {
    rowIndex: number;
    sheetName?: string;
    mediaLinks: string;
    mediaIds: string;
  }): Promise<void> {
    await this.eventStorageService.updateMediaColumns(input);
  }

  protected isConfirmMessage(messageBody: string): boolean {
    const command = normalizeKey(messageBody);
    return ["1", "sim", "s", "confirmar", "confirmo"].includes(command);
  }

  protected isExplicitCancelMessage(messageBody: string): boolean {
    const command = normalizeKey(messageBody);
    return ["cancelar", "cancela"].includes(command);
  }

  protected isRejectMessage(messageBody: string): boolean {
    const command = normalizeKey(messageBody);
    return ["2", "cancelar", "cancela", "nao", "n", "não"].includes(command);
  }

  protected isSkipMediaMessage(messageBody: string): boolean {
    const command = normalizeKey(messageBody);
    return ["-", "2", "pular", "skip", "cancelar", "cancela"].includes(command);
  }

  private async getConversationAnswers(
    conversationId: number,
  ): Promise<ConversationAnswer[]> {
    const rows = await persistenceProvider.repositories.conversationAnswer.findByConversationId(conversationId);

    return rows.map((row) => {
      const question: StoredQuestion = {
        id: row.question_id,
        text: row.text,
        type: row.type,
        helperText: row.helper_text,
        required: row.required,
        order: row.order,
        options: row.options.map((option) => ({
          value: option.value,
          title: option.title,
        })),
      };
      const answerValue = this.parseAnswerValue(row.answer_value);

      return {
        ...question,
        answerValue,
        title: this.getQuestionTitle(question),
        displayValue: this.formatAnswerValue(question, answerValue),
      };
    });
  }

  private parseAnswerValue(value: string | null): unknown {
    if (value === null) {
      return null;
    }

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private buildFieldsFromAnswers(answers: ConversationAnswer[]): FormFields {
    const fields: FormFields = {};

    for (const answer of answers) {
      fields[answer.title] = answer.displayValue;
    }

    return fields;
  }

  private getQuestionTitle(question: StoredQuestion): string {
    return question.text;
  }

  private getQuestionDescription(question: StoredQuestion): string | null {
    if (typeof question.helperText !== "string") {
      return null;
    }

    const trimmed = question.helperText.trim();
    return trimmed || null;
  }

  private buildSelectionMenu(question: StoredQuestion): string {
    const options = this.getSelectionOptions(question);
    return options.map((option, index) => `*${index + 1}.* ${option.title}`).join("\n");
  }

  private formatAnswerValue(question: StoredQuestion, value: unknown): string {
    if (value === null || value === undefined || value === "") {
      return "Nao informado";
    }

    if (
      question.type === "single_choice" ||
      question.type === "multiple_choice"
    ) {
      return this.formatSelectionAnswer(question, value);
    }

    if (Array.isArray(value)) {
      return value.map((item) => String(item)).join(", ");
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  }

  private formatSelectionAnswer(question: StoredQuestion, value: unknown): string {
    const titleById = new Map<string, string>();

    for (const option of question.options) {
      titleById.set(option.value, option.title);
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => titleById.get(String(item)) ?? String(item))
        .join(", ");
    }

    return titleById.get(String(value)) ?? String(value);
  }

  private getStringFieldValue(
    source: FormFields,
    acceptedKeys: string[],
  ): string | undefined {
    const accepted = new Set(acceptedKeys.map(normalizeKey));

    for (const [key, value] of Object.entries(source)) {
      if (!accepted.has(normalizeKey(key))) {
        continue;
      }

      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }

    return undefined;
  }

  /**
   * Envia uma mensagem de texto para o WhatsApp do usuário via API Oficial da Meta
   */
  protected async sendMessage(to: string, text: string): Promise<void> {
      const token = process.env.ACCESS_TOKEN;
      const phoneNumberId = process.env.PHONE_NUMBER_ID;
  
      if (!token || !phoneNumberId) {
        console.error("Faltam variáveis de ambiente (ACCESS_TOKEN ou PHONE_NUMBER_ID) para enviar a mensagem.");
        return;
      }
  
      try {
        await axios.post(
          `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
          {
            messaging_product: "whatsapp",
            to: to,
            type: "text",
            text: { body: text }
          },
          {
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            }
          }
        );
        console.log(`[WhatsApp API] Mensagem enviada para ${to}`);
      } catch (error: any) {
        console.error(`[WhatsApp API] Erro ao enviar mensagem para ${to}:`, error?.response?.data || error.message);
      }
    }
  
}
