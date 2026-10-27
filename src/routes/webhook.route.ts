import { Router } from "express";

import { webhookController } from "../controllers/webhook.controller.js";
import { validateMetaWebhookSignatureMiddleware } from "../middlewares/validate-meta-webhook-signature.middleware.js";

export const webhookRouter = Router();

webhookRouter.get("/", (request, response) =>
  webhookController.verify(request, response),
);

webhookRouter.post("/", validateMetaWebhookSignatureMiddleware, (request, response) =>
  webhookController.receive(request, response),
);
