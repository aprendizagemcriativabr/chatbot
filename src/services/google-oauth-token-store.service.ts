import type { GoogleOAuthTokens } from "./google-oauth.service";

import { persistenceProvider } from "../persistence/index.js";

const GOOGLE_DRIVE_ACCOUNT_KEY = "rbac_drive";

export class GoogleOAuthTokenStoreService {
  async getTokens(): Promise<GoogleOAuthTokens | null> {
    const row = await persistenceProvider.repositories.googleOAuthToken.getTokens(
      GOOGLE_DRIVE_ACCOUNT_KEY,
    );

    if (!row) {
      return null;
    }

    return {
      access_token: row.accessToken,
      refresh_token: row.refreshToken,
    };
  }

  async saveTokens(tokens: GoogleOAuthTokens): Promise<void> {
    await persistenceProvider.repositories.googleOAuthToken.upsertTokens(
      GOOGLE_DRIVE_ACCOUNT_KEY,
      tokens.access_token ?? null,
      tokens.refresh_token ?? null,
    );
  }

  async clearTokens(): Promise<void> {
    await persistenceProvider.repositories.googleOAuthToken.clearTokens(
      GOOGLE_DRIVE_ACCOUNT_KEY,
    );
  }

  async hasTokens(): Promise<boolean> {
    return persistenceProvider.repositories.googleOAuthToken.hasTokens(
      GOOGLE_DRIVE_ACCOUNT_KEY,
    );
  }
}

export const googleOAuthTokenStoreService = new GoogleOAuthTokenStoreService();
