import type { RequestHandler } from "express";
import { authenticationService } from "../services/authentication.service.js";

const SIGNATURE_HEADER = "x-hub-signature-256";

export const validateMetaWebhookSignatureMiddleware: RequestHandler = (
  request,
  response,
  next,
) => {
  const verification = authenticationService.verifyWebhookSignature(
    request.rawBody,
    request.headers[SIGNATURE_HEADER],
  );

  if (verification.misconfigured) {
    return response.status(500).json({ error: "server misconfiguration" });
  }

  if (!verification.ok) {
    return response.status(403).json({ error: "invalid webhook signature" });
  }

  return next();
};
