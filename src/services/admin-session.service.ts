import crypto from "node:crypto";

const SESSION_COOKIE_NAME = "admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

type SessionPayload = {
  exp: number;
};

function toBase64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromBase64Url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function createSignature(payloadBase64: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(payloadBase64)
    .digest("base64url");
}

class AdminSessionService {
  create(secret: string): string {
    const payload: SessionPayload = {
      exp: Date.now() + SESSION_TTL_MS,
    };

    const payloadBase64 = toBase64Url(JSON.stringify(payload));
    const signature = createSignature(payloadBase64, secret);

    return `${payloadBase64}.${signature}`;
  }

  isValid(sessionValue: string, secret: string): boolean {
    const separatorIndex = sessionValue.lastIndexOf(".");

    if (separatorIndex <= 0 || separatorIndex === sessionValue.length - 1) {
      return false;
    }

    const payloadBase64 = sessionValue.slice(0, separatorIndex);
    const providedSignature = sessionValue.slice(separatorIndex + 1);

    const expectedSignature = createSignature(payloadBase64, secret);
    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    const providedBuffer = Buffer.from(providedSignature, "utf8");

    if (
      expectedBuffer.length !== providedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      return false;
    }

    try {
      const payload = JSON.parse(fromBase64Url(payloadBase64)) as SessionPayload;

      return (
        typeof payload.exp === "number" &&
        Number.isFinite(payload.exp) &&
        Date.now() <= payload.exp
      );
    } catch {
      return false;
    }
  }
}

export const adminSessionService = new AdminSessionService();
export { SESSION_COOKIE_NAME, SESSION_TTL_MS };
