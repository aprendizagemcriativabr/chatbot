import type { RequestHandler } from "express";
import { parse as parseCookie } from "cookie";

import { adminSessionService, SESSION_COOKIE_NAME } from "../services/admin-session.service.js";

export const validateAdminSessionMiddleware: RequestHandler = (
  request,
  response,
  next,
) => {
  const adminToken = process.env.ADMIN_TOKEN;

  if (!adminToken) {
    return response.status(500).send("server misconfiguration");
  }

  const cookies = parseCookie(request.headers.cookie ?? "");
  const sessionId = cookies[SESSION_COOKIE_NAME];

  if (!sessionId || !adminSessionService.isValid(sessionId, adminToken)) {
    const acceptHeader = request.headers.accept ?? "";
    const expectsJson =
      typeof acceptHeader === "string" && acceptHeader.includes("application/json");

    if (request.originalUrl.startsWith("/api/") || expectsJson) {
      return response.status(401).json({ error: "invalid admin session" });
    }

    return response.redirect(302, "/admin");
  }

  return next();
};
