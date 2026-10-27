import type { TransactionContext } from "../persistence/index.js";
import { persistenceProvider } from "../persistence/index.js";

const DEFAULT_SHEET_TAB_KEY = "google_sheets_active_tab";

export class AppConfigService {
  async getConfigValue(key: string): Promise<string | null> {
    return persistenceProvider.repositories.appConfig.getConfigValue(key);
  }

  async setConfigValue(
    key: string,
    value: string,
    transaction?: TransactionContext,
  ): Promise<void> {
    await persistenceProvider.repositories.appConfig.setConfigValue(key, value, transaction);
  }

  async getActiveSheetName(): Promise<string | null> {
    return this.getConfigValue(DEFAULT_SHEET_TAB_KEY);
  }

  async setActiveSheetName(
    sheetName: string,
    transaction?: TransactionContext,
  ): Promise<void> {
    await this.setConfigValue(DEFAULT_SHEET_TAB_KEY, sheetName, transaction);
  }
}

export const appConfigService = new AppConfigService();
