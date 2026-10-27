import axios, { AxiosError, type AxiosRequestConfig } from "axios";

import type { GoogleApiConfig } from "./google-api.config.js";
import { googleOAuthTokenStoreService } from "../../services/google-oauth-token-store.service.js";

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type OAuthTokenResponse = {
  access_token: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

type GoogleApiErrorPayload = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: unknown;
    errors?: unknown;
  };
};

function summarizeRequestData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === "string") {
    return data.length > 1000 ? `${data.slice(0, 1000)}...` : data;
  }

  return data;
}

export class GoogleApiClient {
  private sessionAccessToken: string | null = null;
  private sessionAccessTokenExpiresAt = 0;
  private refreshPromise: Promise<string> | null = null;

  constructor(private readonly config: GoogleApiConfig) {}

  private isSessionTokenValid(): boolean {
    return (
      Boolean(this.sessionAccessToken) &&
      Date.now() < this.sessionAccessTokenExpiresAt - 60_000
    );
  }

  private clearSessionToken(): void {
    this.sessionAccessToken = null;
    this.sessionAccessTokenExpiresAt = 0;
  }

  private async refreshOAuthAccessToken(): Promise<string> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      const tokens = await googleOAuthTokenStoreService.getTokens();

      if (!tokens?.refresh_token) {
        throw new Error("Google account not connected. Access /api/auth/google first.");
      }

      const response = await axios.request<OAuthTokenResponse>({
        method: "POST",
        url: "https://oauth2.googleapis.com/token",
        timeout: this.config.timeoutMs,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        data: new URLSearchParams({
          client_id: this.config.oauthClientId,
          client_secret: this.config.oauthClientSecret,
          refresh_token: tokens.refresh_token,
          grant_type: "refresh_token",
        }).toString(),
      });

      const accessToken = response.data.access_token;
      if (!accessToken) {
        throw new Error("OAuth token response missing access_token");
      }

      const expiresIn = response.data.expires_in || 3600;
      this.sessionAccessToken = accessToken;
      this.sessionAccessTokenExpiresAt = Date.now() + expiresIn * 1000;

      googleOAuthTokenStoreService
        .saveTokens({
          access_token: accessToken,
          refresh_token: tokens.refresh_token,
          scope: response.data.scope,
          token_type: response.data.token_type,
          expiry_date: this.sessionAccessTokenExpiresAt,
        })
        .catch((error: unknown) => {
          console.error("Failed to persist refreshed Google OAuth token", error);
        });

      return accessToken;
    })();

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.isSessionTokenValid() && this.sessionAccessToken) {
      return this.sessionAccessToken;
    }

    return this.refreshOAuthAccessToken();
  }

  async request<T>(request: AxiosRequestConfig): Promise<T> {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const accessToken = await this.getAccessToken();

        const response = await axios.request<T>({
          ...request,
          timeout: this.config.timeoutMs,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(request.headers || {}),
          },
        });

        return response.data;
      } catch (error) {
        const isAxiosError = axios.isAxiosError(error);
        const status = isAxiosError ? error.response?.status : undefined;

        if (isAxiosError) {
          const axiosError = error as AxiosError<GoogleApiErrorPayload>;
          const payload = axiosError.response?.data;
          const googleError = payload?.error;

          const debugPayload = {
            attempt,
            maxAttempts,
            method: request.method ?? "GET",
            url: request.url,
            status,
            statusText: axiosError.response?.statusText,
            googleCode: googleError?.code,
            googleStatus: googleError?.status,
            googleMessage: googleError?.message,
            googleDetails: googleError?.details,
            googleErrors: googleError?.errors,
            responseData: payload,
            requestData: summarizeRequestData(request.data),
          };
          console.error(
            `[GoogleApiClient] Request failed: ${JSON.stringify(debugPayload)}`,
          );
        } else {
          console.error("[GoogleApiClient] Non-Axios error", {
            attempt,
            maxAttempts,
            method: request.method ?? "GET",
            url: request.url,
            error,
          });
        }

        if (status === 401) {
          this.clearSessionToken();

          if (attempt < maxAttempts) {
            continue;
          }
        }

        const retryable = status !== undefined && RETRYABLE_STATUS.has(status);
        const isLastAttempt = attempt === maxAttempts;

        if (!retryable || isLastAttempt) {
          throw error;
        }

        await sleep(250 * attempt);
      }
    }

    throw new Error("Unexpected Google API request flow");
  }
}
