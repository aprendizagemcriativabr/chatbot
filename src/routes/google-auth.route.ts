import { Router } from "express";

import { googleOAuthService } from "../services/google-oauth.service";
import { googleOAuthTokenStoreService } from "../services/google-oauth-token-store.service";

export const googleAuthRouter = Router();

googleAuthRouter.get("/auth/google", (_request, response, next) => {
  try {
    return response.redirect(googleOAuthService.getAuthUrl());
  } catch (error) {
    return next(error);
  }
});

googleAuthRouter.get("/google/callback", async (request, response, next) => {
  try {
    const code = request.query.code;

    if (!code || typeof code !== "string") {
      return response.status(400).json({
        message: "missing code",
      });
    }

    const tokens = await googleOAuthService.getTokensFromCode(code);
    await googleOAuthTokenStoreService.saveTokens(tokens);

    return response.status(200).json({
      message: "Google OAuth conectado com sucesso",
      hasRefreshToken: Boolean(tokens.refresh_token),
    });
  } catch (error) {
    return next(error);
  }
});

googleAuthRouter.get("/auth/google/status", async (_request, response, next) => {
  try {
    return response.status(200).json({
      connected: await googleOAuthTokenStoreService.hasTokens(),
    });
  } catch (error) {
    return next(error);
  }
});
