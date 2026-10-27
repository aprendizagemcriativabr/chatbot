import crypto from "node:crypto";

const SIGNATURE_PREFIX = "sha256=";

type SignatureVerificationResult = {
  ok: boolean;
  misconfigured: boolean;
};

type WebhookChallengeResult = {
  ok: boolean;
  challenge?: string;
  misconfigured: boolean;
};

export class AuthenticationService {
  verifyWebhookSignature(
    rawBody: Buffer | undefined,
    signatureHeader: string | string[] | undefined,
  ): SignatureVerificationResult {
    const appSecret = process.env.APP_SECRET;

    if (!appSecret) {
      return { ok: false, misconfigured: true };
    }

    if (
      typeof signatureHeader !== "string" ||
      !signatureHeader.startsWith(SIGNATURE_PREFIX)
    ) {
      return { ok: false, misconfigured: false };
    }

    const receivedSignature = signatureHeader.slice(SIGNATURE_PREFIX.length).trim();

    if (!/^[a-f0-9]{64}$/i.test(receivedSignature)) {
      return { ok: false, misconfigured: false };
    }

    const expectedSignature = crypto
      .createHmac("sha256", appSecret)
      .update(rawBody ?? Buffer.from(""))
      .digest("hex");

    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    const receivedBuffer = Buffer.from(receivedSignature, "hex");

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      return { ok: false, misconfigured: false };
    }

    return { ok: true, misconfigured: false };
  }

  verifyWebhookChallenge(query: {
    "hub.mode"?: string;
    "hub.challenge"?: string;
    "hub.verify_token"?: string;
  }): WebhookChallengeResult {
    const expectedVerifyToken = process.env.VERIFY_TOKEN;

    if (!expectedVerifyToken) {
      return { ok: false, misconfigured: true };
    }

    if (
      query["hub.mode"] === "subscribe" &&
      query["hub.verify_token"] === expectedVerifyToken &&
      query["hub.challenge"]
    ) {
      return {
        ok: true,
        challenge: query["hub.challenge"],
        misconfigured: false,
      };
    }

    return { ok: false, misconfigured: false };
  }
}

export const authenticationService = new AuthenticationService();
