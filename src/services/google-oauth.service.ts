import { google } from "googleapis";

export type GoogleOAuthTokens = {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string;
  token_type?: string | null;
  expiry_date?: number | null;
};

export class GoogleOAuthService {
  private createClient() {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

    if (!clientId) {
      throw new Error("missing required env var GOOGLE_OAUTH_CLIENT_ID");
    }

    if (!clientSecret) {
      throw new Error("missing required env var GOOGLE_OAUTH_CLIENT_SECRET");
    }

    if (!redirectUri) {
      throw new Error("missing required env var GOOGLE_OAUTH_REDIRECT_URI");
    }

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  getAuthUrl(): string {
    const oauth2Client = this.createClient();

    return oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/spreadsheets",
      ],
    });
  }

  async getTokensFromCode(code: string): Promise<GoogleOAuthTokens> {
    const oauth2Client = this.createClient();
    const { tokens } = await oauth2Client.getToken(code);

    return tokens;
  }

}

export const googleOAuthService = new GoogleOAuthService();
