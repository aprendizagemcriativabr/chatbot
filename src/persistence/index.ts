import type { DbProvider, PersistenceProvider } from "./contracts/types.js";
import { SqlServerPersistenceProvider } from "./providers/sqlserver/sqlserver.provider.js";
import { SqlitePersistenceProvider } from "./providers/sqlite/sqlite.provider.js";

function resolveProviderFromEnv(): DbProvider {
  const raw = process.env.DB_PROVIDER?.trim().toLowerCase();
  if (!raw) {
    return "sqlserver";
  }

  if (raw === "sqlserver" || raw === "sqlite") {
    return raw;
  }

  throw new Error(`Invalid DB_PROVIDER: ${raw}. Expected 'sqlserver' or 'sqlite'.`);
}

function buildProvider(): PersistenceProvider {
  const provider = resolveProviderFromEnv();
  return provider === "sqlite"
    ? new SqlitePersistenceProvider()
    : new SqlServerPersistenceProvider();
}

export const persistenceProvider = buildProvider();
export type { DbProvider, PersistenceProvider, TransactionContext, UnitOfWork } from "./contracts/types.js";
