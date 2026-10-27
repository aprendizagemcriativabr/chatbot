import type { Request, Response } from "express";

import {
  webhookVerificationQuerySchema,
  whatsAppWebhookPayloadSchema,
  type WhatsAppMessage,
  type WhatsAppWebhookPayload,
} from "../schemas/webhook.schema.js";
import { authenticationService } from "../services/authentication.service.js";
import { chatbotNormalService } from "../services/chatbot.normal.service.js";
import { webhookMessageParserService } from "../services/webhook-message-parser.service.js";

export class WebhookController {
  verify(request: Request, response: Response) {
    const query = webhookVerificationQuerySchema.parse(request.query);
    const challengeVerification =
      authenticationService.verifyWebhookChallenge(query);

    if (challengeVerification.misconfigured) {
      return response.status(500).json({ error: "server misconfiguration" });
    }

    if (challengeVerification.ok && challengeVerification.challenge) {
      return response.status(200).send(challengeVerification.challenge);
    }

    return response.status(403).end();
  }

  async receive(request: Request, response: Response) {
    const payload = whatsAppWebhookPayloadSchema.parse(request.body);

    response.status(200).end();

    this.processPayload(payload).catch((error) => {
      console.error("[Webhook] Erro ao processar payload:", error);
    });
  }

  private async processPayload(payload: WhatsAppWebhookPayload): Promise<void> {
    for (const message of this.extractMessages(payload)) {
      await this.processMessage(message);
    }
  }

  private extractMessages(payload: WhatsAppWebhookPayload): WhatsAppMessage[] {
    return payload.entry.flatMap((entry) =>
      entry.changes.flatMap((change) => {
        if (change.field !== "messages") {
          return [];
        }

        return change.value.messages ?? [];
      }),
    );
  }

  private async processMessage(message: WhatsAppMessage): Promise<void> {
    const parsedMessage = webhookMessageParserService.parseMessage(message);

    console.info(
      `[Webhook] Received message (type=${parsedMessage.messageType}, from=${parsedMessage.phoneNumber})`,
    );

    await chatbotNormalService.processMessage(
      parsedMessage.phoneNumber,
      parsedMessage.messageType,
      parsedMessage.messageBody,
      parsedMessage.media,
    );
  }
}

export const webhookController = new WebhookController();
