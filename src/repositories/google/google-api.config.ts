export type GoogleApiConfig = {
  oauthClientId: string;
  oauthClientSecret: string;
  timeoutMs: number;
  sheetsSpreadsheetId: string;
  sheetsRange: string;
  sheetsHeaderRange: string;
  driveFolderId: string;
  driveAutoProjectFolder: boolean;
  driveProjectFolderPrefix?: string;
};

export function loadGoogleApiConfig(): GoogleApiConfig {
  const oauthClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const oauthClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const sheetsSpreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const driveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!oauthClientId) {
    throw new Error("Missing env GOOGLE_OAUTH_CLIENT_ID");
  }

  if (!oauthClientSecret) {
    throw new Error("Missing env GOOGLE_OAUTH_CLIENT_SECRET");
  }

  if (!sheetsSpreadsheetId) {
    throw new Error("Missing env GOOGLE_SHEETS_SPREADSHEET_ID");
  }

  if (!driveFolderId) {
    throw new Error("Missing env GOOGLE_DRIVE_FOLDER_ID");
  }

  return {
    oauthClientId,
    oauthClientSecret,
    timeoutMs: 15000,
    sheetsSpreadsheetId,
    sheetsRange: "A:ZZ",
    sheetsHeaderRange: "A1:ZZ1",
    driveFolderId,
    driveAutoProjectFolder: false,
    driveProjectFolderPrefix: undefined,
  };
}
