import type { WhatsAppMessage } from "../schemas/webhook.schema.js";
import type { IncomingMedia } from "./chatbot.base.service.js";

export type ParsedIncomingMessage = {
  phoneNumber: string;
  messageType: string;
  messageBody: string;
  media: IncomingMedia | null;
};

export class WebhookMessageParserService {
  parseMessage(message: WhatsAppMessage): ParsedIncomingMessage {
    return {
      phoneNumber: message.from,
      messageType: message.type,
      messageBody: this.extractMessageBody(message),
      media: this.extractMedia(message),
    };
  }

  private extractMessageBody(message: WhatsAppMessage): string {
    if (message.type === "text" && message.text) {
      return message.text.body ?? "";
    }

    return "";
  }

  private extractMedia(message: WhatsAppMessage): IncomingMedia | null {
    if (message.type === "image" && message.image?.id) {
      return {
        id: message.image.id,
        type: "image",
        caption: message.image.caption,
      };
    }

    if (message.type === "video" && message.video?.id) {
      return {
        id: message.video.id,
        type: "video",
        caption: message.video.caption,
      };
    }

    return null;
  }
}

export const webhookMessageParserService = new WebhookMessageParserService();
