import express, { type Request, type Response } from "express";
import { serialize as serializeCookie } from "cookie";
import path from "node:path";
import crypto from "node:crypto";

import { errorLoggerMiddleware } from "./middlewares/error-logger.middleware.js";
import { requestLoggerMiddleware } from "./middlewares/request-logger.middleware.js";
import { validateAdminSessionMiddleware } from "./middlewares/validate-admin-session.middleware.js";
import { router } from "./routes/index.js";
import { adminSessionService, SESSION_COOKIE_NAME } from "./services/admin-session.service.js";
import { webhookRouter } from "./routes/webhook.route.js";

export const app = express();
const adminPublicDir = path.resolve(process.cwd(), "public/admin");
const isProduction = process.env.NODE_ENV === "production";

function isValidAdminToken(providedToken: string, expectedToken: string): boolean {
  const expectedBuffer = Buffer.from(expectedToken, "utf8");
  const providedBuffer = Buffer.from(providedToken, "utf8");

  return (
    expectedBuffer.length === providedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

app.use(
  express.json({
    verify: (request, _response, buffer) => {
      (request as Request).rawBody = Buffer.from(buffer);
    },
  }),
);
app.use(requestLoggerMiddleware);
app.get("/admin", (_request, response) => {
  response.sendFile(path.join(adminPublicDir, "login.html"));
});
app.post("/admin/session", (request, response) => {
  const adminToken = process.env.ADMIN_TOKEN;

  if (!adminToken) {
    return response.status(500).json({ error: "server misconfiguration" });
  }

  const token =
    typeof request.body === "object" &&
    request.body !== null &&
    "token" in request.body &&
    typeof request.body.token === "string"
      ? request.body.token.trim()
      : "";

  if (!token || !isValidAdminToken(token, adminToken)) {
    return response.status(404).json({ error: "not found" });
  }

  const sessionId = adminSessionService.create(adminToken);

  response.setHeader(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE_NAME, sessionId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 28800,
    }),
  );

  return response.status(204).send();
});
app.delete("/admin/session", (_request, response) => {
  response.setHeader(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE_NAME, "", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 0,
    }),
  );

  return response.status(204).send();
});
app.use("/admin/assets", express.static(adminPublicDir));

const serveAdminPanel = (_request: Request, response: Response) => {
  response.sendFile(path.join(adminPublicDir, "panel.html"));
};

app.get("/admin/select", validateAdminSessionMiddleware, serveAdminPanel);
app.get("/admin/panel", validateAdminSessionMiddleware, serveAdminPanel);
app.get("/admin/articulators", validateAdminSessionMiddleware, serveAdminPanel);
app.get("/admin/questions", validateAdminSessionMiddleware, serveAdminPanel);
app.use("/webhook", webhookRouter);
app.use("/api", router);
app.use(errorLoggerMiddleware);
