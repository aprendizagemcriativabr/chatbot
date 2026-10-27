import type {
  FormSaveResult,
  FormSubmission,
  MediaSheetUpdateInput,
} from "../contracts/event-storage.repository.js";
import axios from "axios";
import type { GoogleApiConfig } from "./google-api.config.js";
import { GoogleApiClient } from "./google-api.client.js";

type GoogleSheetsAppendResponse = {
  updates?: {
    updatedRange?: string;
    updatedRows?: number;
    updatedColumns?: number;
    updatedCells?: number;
  };
};

type GoogleSheetsValuesResponse = {
  values?: Array<Array<string | number | boolean | null>>;
};

type GoogleSheetsBatchUpdateResponse = {
  replies?: Array<{
    addSheet?: {
      properties?: {
        sheetId?: number;
      };
    };
  }>;
};

type GoogleSpreadsheetMetadataResponse = {
  sheets?: Array<{
    properties?: {
      title?: string;
    };
  }>;
};

type FormCellValue = string | number | boolean | null;

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function quoteSheetName(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

function buildSheetRange(range: string, sheetName?: string): string {
  if (!sheetName) {
    return range;
  }

  return `${quoteSheetName(sheetName)}!${range}`;
}

function columnLetter(columnIndex: number): string {
  let result = "";
  let dividend = columnIndex;

  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    result = String.fromCharCode(65 + modulo) + result;
    dividend = Math.floor((dividend - 1) / 26);
  }

  return result;
}

function extractRowIndexFromRange(updatedRange?: string): number | undefined {
  if (!updatedRange) {
    return undefined;
  }

  const match = updatedRange.match(/![A-Z]+(\d+):[A-Z]+\d+$/i);
  if (!match) {
    return undefined;
  }

  const rowIndex = Number.parseInt(match[1], 10);
  if (Number.isNaN(rowIndex) || rowIndex < 1) {
    return undefined;
  }

  return rowIndex;
}

export class GoogleSheetsFormRepository {
  private readonly client: GoogleApiClient;
  private headerCache = new Map<string, string[]>();

  constructor(private readonly config: GoogleApiConfig) {
    this.client = new GoogleApiClient(config);
  }

  private async listSheetTitles(): Promise<string[]> {
    const response = await this.client.request<GoogleSpreadsheetMetadataResponse>({
      method: "GET",
      url: `https://sheets.googleapis.com/v4/spreadsheets/${this.config.sheetsSpreadsheetId}?fields=sheets.properties.title`,
    });

    return (response.sheets || [])
      .map((sheet) => sheet.properties?.title)
      .filter((title): title is string => typeof title === "string" && title.length > 0);
  }

  private async buildNextSequentialSheetName(baseName = "Planilha"): Promise<string> {
    const titles = await this.listSheetTitles();
    const regex = new RegExp(`^${baseName}-(\\d+)$`);
    let maxSuffix = 0;

    for (const title of titles) {
      const match = title.match(regex);
      if (!match) {
        continue;
      }

      const suffix = Number(match[1]);
      if (Number.isInteger(suffix) && suffix > maxSuffix) {
        maxSuffix = suffix;
      }
    }

    return `${baseName}-${maxSuffix + 1}`;
  }

  private isDuplicateSheetNameError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return false;
    }

    const message = (error.response?.data as { error?: { message?: string } } | undefined)
      ?.error?.message;

    return typeof message === "string" && message.includes("Já existe uma página chamada");
  }

  async createSheetWithHeaders(
    headers: string[],
    baseName = "Planilha",
  ): Promise<{ sheetName: string }> {
    let sheetName = await this.buildNextSequentialSheetName(baseName);
    let response: GoogleSheetsBatchUpdateResponse | null = null;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const requestBody = {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            },
          ],
        };

        response = await this.client.request<GoogleSheetsBatchUpdateResponse>({
          method: "POST",
          url: `https://sheets.googleapis.com/v4/spreadsheets/${this.config.sheetsSpreadsheetId}:batchUpdate`,
          data: requestBody,
          headers: {
            "Content-Type": "application/json",
          },
        });
        break;
      } catch (error) {
        const shouldRetry = attempt < maxAttempts && this.isDuplicateSheetNameError(error);
        if (!shouldRetry) {
          throw error;
        }

        sheetName = await this.buildNextSequentialSheetName(baseName);
      }
    }

    if (!response) {
      throw new Error("Failed to create sheet due to unknown state");
    }

    const headerRange = encodeURIComponent(
      buildSheetRange(
        `A1:${columnLetter(headers.length)}1`,
        sheetName,
      ),
    );
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.config.sheetsSpreadsheetId}/values/${headerRange}?valueInputOption=USER_ENTERED`;

    await this.client.request({
      method: "PUT",
      url,
      data: {
        values: [headers],
      },
      headers: {
        "Content-Type": "application/json",
      },
    });

    const sheetId = response.replies?.[0]?.addSheet?.properties?.sheetId;
    if (typeof sheetId !== "number") {
      return { sheetName };
    }

    await this.client.request({
      method: "POST",
      url: `https://sheets.googleapis.com/v4/spreadsheets/${this.config.sheetsSpreadsheetId}:batchUpdate`,
      data: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: headers.length,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.09,
                    green: 0.35,
                    blue: 0.72,
                  },
                  textFormat: {
                    bold: true,
                    foregroundColor: {
                      red: 1,
                      green: 1,
                      blue: 1,
                    },
                  },
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat)",
            },
          },
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId,
                dimension: "COLUMNS",
                startIndex: 0,
                endIndex: headers.length,
              },
            },
          },
        ],
      },
      headers: {
        "Content-Type": "application/json",
      },
    });

    return { sheetName };
  }

  private async getHeaderColumns(sheetName?: string): Promise<string[]> {
    const cacheKey = sheetName ?? "__default__";
    const cachedHeaders = this.headerCache.get(cacheKey);
    if (cachedHeaders) {
      return cachedHeaders;
    }

    const range = encodeURIComponent(
      buildSheetRange(this.config.sheetsHeaderRange, sheetName),
    );
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.config.sheetsSpreadsheetId}/values/${range}?majorDimension=ROWS`;

    const response = await this.client.request<GoogleSheetsValuesResponse>({
      method: "GET",
      url,
    });

    const firstRow = Array.isArray(response.values) ? response.values[0] : [];

    if (!firstRow || firstRow.length === 0) {
      const defaultHeaders = ["Telefone", "Articulador", "fields", "Data/Hora"];
      this.headerCache.set(cacheKey, defaultHeaders);
      return defaultHeaders;
    }

    const headers = firstRow.map((column) => String(column || ""));
    this.headerCache.set(cacheKey, headers);
    return headers;
  }

  private async writeHeaders(headers: string[], sheetName?: string): Promise<void> {
    const headerRange = encodeURIComponent(
      buildSheetRange(`A1:${columnLetter(headers.length)}1`, sheetName),
    );
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.config.sheetsSpreadsheetId}/values/${headerRange}?valueInputOption=USER_ENTERED`;

    await this.client.request({
      method: "PUT",
      url,
      data: {
        values: [headers],
      },
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  private async ensureMediaHeaderColumns(sheetName?: string): Promise<{ linksColumn: number; idsColumn: number }> {
    const headers = await this.getHeaderColumns(sheetName);
    let nextHeaders = [...headers];

    let linksColumn = nextHeaders.findIndex((header) => normalizeKey(header) === normalizeKey("Midia Links"));
    if (linksColumn < 0) {
      nextHeaders.push("Midia Links");
      linksColumn = nextHeaders.length - 1;
    }

    let idsColumn = nextHeaders.findIndex((header) => normalizeKey(header) === normalizeKey("Midia IDs"));
    if (idsColumn < 0) {
      nextHeaders.push("Midia IDs");
      idsColumn = nextHeaders.length - 1;
    }

    const headersChanged = nextHeaders.length !== headers.length;
    if (headersChanged) {
      await this.writeHeaders(nextHeaders, sheetName);
      this.headerCache.set(sheetName ?? "__default__", nextHeaders);
    }

    return {
      linksColumn: linksColumn + 1,
      idsColumn: idsColumn + 1,
    };
  }

  private buildRowByHeaders(
    headers: string[],
    data: FormSubmission,
    submittedAt: string,
    source: string,
    fields: Record<string, FormCellValue>,
  ): FormCellValue[] {
    const fieldsByKey = new Map<string, FormCellValue>();

    for (const [fieldKey, fieldValue] of Object.entries(fields)) {
      fieldsByKey.set(normalizeKey(fieldKey), fieldValue);
    }

    return headers.map((header) => {
      const normalizedHeader = normalizeKey(header);

      if (!normalizedHeader) {
        return "";
      }

      if (
        normalizedHeader === "carimbo" ||
        normalizedHeader === "submittedat" ||
        normalizedHeader === "datahora" ||
        normalizedHeader === "datadeenvio"
      ) {
        return submittedAt;
      }

      if (
        normalizedHeader === "phone" ||
        normalizedHeader === "telefone" ||
        normalizedHeader === "celular" ||
        normalizedHeader === "whatsapp"
      ) {
        return data.phone;
      }

      if (
        normalizedHeader === "articulador" ||
        normalizedHeader === "nomearticulador"
      ) {
        return data.articulatorName || "";
      }

      if (normalizedHeader === "source" || normalizedHeader === "origem") {
        return source;
      }

      if (
        normalizedHeader === "fields" ||
        normalizedHeader === "json" ||
        normalizedHeader === "payload"
      ) {
        return JSON.stringify(fields);
      }

      if (fieldsByKey.has(normalizedHeader)) {
        return fieldsByKey.get(normalizedHeader) ?? "";
      }

      return "";
    });
  }

  async saveFormSubmission(data: FormSubmission): Promise<FormSaveResult> {
    const submittedAt = data.submittedAt || new Date().toISOString();
    const source = data.source || "whatsapp";
    const headers = await this.getHeaderColumns(data.sheetName);

    const orderedEntries = Object.entries(data.fields).sort(([a], [b]) =>
      a.localeCompare(b),
    );

    const normalizedFields = Object.fromEntries(orderedEntries);

    const row = this.buildRowByHeaders(
      headers,
      data,
      submittedAt,
      source,
      normalizedFields,
    );

    const range = encodeURIComponent(
      buildSheetRange(this.config.sheetsRange, data.sheetName),
    );
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.config.sheetsSpreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;

    const response = await this.client.request<GoogleSheetsAppendResponse>({
      method: "POST",
      url,
      data: { values: [row] },
      headers: {
        "Content-Type": "application/json",
      },
    });

    const updatedRange = response.updates?.updatedRange;

    return {
      rowIndex: extractRowIndexFromRange(updatedRange),
      updatedRange,
      updatedRows: response.updates?.updatedRows,
      updatedColumns: response.updates?.updatedColumns,
      updatedCells: response.updates?.updatedCells,
    };
  }

  async updateMediaColumnsByRow(input: MediaSheetUpdateInput): Promise<void> {
    const mediaColumns = await this.ensureMediaHeaderColumns(input.sheetName);
    const startColumn = columnLetter(mediaColumns.linksColumn);
    const endColumn = columnLetter(mediaColumns.idsColumn);

    const updateRange = encodeURIComponent(
      buildSheetRange(
        `${startColumn}${input.rowIndex}:${endColumn}${input.rowIndex}`,
        input.sheetName,
      ),
    );
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.config.sheetsSpreadsheetId}/values/${updateRange}?valueInputOption=USER_ENTERED`;

    await this.client.request({
      method: "PUT",
      url,
      data: {
        values: [[input.mediaLinks, input.mediaIds]],
      },
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}
