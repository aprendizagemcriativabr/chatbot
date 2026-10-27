import crypto from "node:crypto";
import type { RequestHandler } from "express";
import { parse as parseCookie } from "cookie";
import { adminSessionService, SESSION_COOKIE_NAME } from "../services/admin-session.service.js";

const AUTHORIZATION_HEADER = "authorization";
const BEARER_PREFIX = "Bearer ";

export const validateAdminTokenMiddleware: RequestHandler = (
  request,
  response,
  next,
) => {
  const adminToken = process.env.ADMIN_TOKEN;

  if (!adminToken) {
    return response.status(500).json({ error: "server misconfiguration" });
  }

  const authorizationHeader = request.headers[AUTHORIZATION_HEADER];

  const cookies = parseCookie(request.headers.cookie ?? "");
  const sessionId = cookies[SESSION_COOKIE_NAME];

  if (sessionId && adminSessionService.isValid(sessionId, adminToken)) {
    return next();
  }

  if (
    typeof authorizationHeader !== "string" ||
    !authorizationHeader.startsWith(BEARER_PREFIX)
  ) {
    return response.status(401).json({ error: "invalid admin token" });
  }

  const providedToken = authorizationHeader.slice(BEARER_PREFIX.length).trim();

  if (!providedToken) {
    return response.status(401).json({ error: "invalid admin token" });
  }

  const expectedBuffer = Buffer.from(adminToken, "utf8");
  const providedBuffer = Buffer.from(providedToken, "utf8");

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return response.status(401).json({ error: "invalid admin token" });
  }

  return next();
};
