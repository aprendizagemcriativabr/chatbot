import { z } from "zod";

// ---- Webhook verification (GET) ----

export const webhookVerificationQuerySchema = z.object({
  "hub.mode": z.string().optional(),
  "hub.challenge": z.string().optional(),
  "hub.verify_token": z.string().optional(),
});

// ---- WhatsApp incoming message webhook (POST) ----

const whatsAppMessageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  image: z
    .object({
      id: z.string().optional(),
      caption: z.string().optional(),
    })
    .optional(),
  video: z
    .object({
      id: z.string().optional(),
      caption: z.string().optional(),
    })
    .optional(),
  interactive: z
    .object({
      type: z.string().optional(),
      nfm_reply: z
        .object({
          response_json: z
            .union([z.string(), z.record(z.string(), z.unknown())])
            .optional(),
          body: z.string().optional(),
          name: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

const whatsAppWebhookValueSchema = z.object({
  messaging_product: z.string().optional(),
  metadata: z
    .object({
      display_phone_number: z.string().optional(),
      phone_number_id: z.string().optional(),
    })
    .optional(),
  contacts: z
    .array(
      z.object({
        profile: z.object({ name: z.string() }).optional(),
        wa_id: z.string(),
      }),
    )
    .optional(),
  messages: z.array(whatsAppMessageSchema).optional(),
  statuses: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const whatsAppWebhookPayloadSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: whatsAppWebhookValueSchema,
        }),
      ),
    }),
  ),
});

export type WhatsAppMessage = z.infer<typeof whatsAppMessageSchema>;
export type WhatsAppWebhookPayload = z.infer<typeof whatsAppWebhookPayloadSchema>;
