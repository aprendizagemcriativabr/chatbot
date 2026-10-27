import sql from "mssql";

export class SqlServerDatabase {
  private static pool: sql.ConnectionPool | null = null;

  private static readonly config: sql.config = {
    server: process.env.DB_SERVER!,
    database: process.env.DB_NAME!,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
  };

  static async connect(retries = 3): Promise<sql.ConnectionPool> {
    if (this.pool) {
      return this.pool;
    }

    try {
      this.pool = await sql.connect(this.config);
      console.info("[DB] Connected to Azure SQL Database");
      return this.pool;
    } catch (error) {
      console.error("[DB] Error connecting to Azure SQL Database", error);

      if (retries <= 0) {
        throw error;
      }

      console.warn("[DB] Retrying connection in 5 seconds");
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return this.connect(retries - 1);
    }
  }

  static getPool(): sql.ConnectionPool {
    if (!this.pool) {
      throw new Error("Database not connected. Call connect() first.");
    }
    return this.pool;
  }

  static async close(): Promise<void> {
    if (!this.pool) {
      return;
    }

    await this.pool.close();
    this.pool = null;
    console.info("[DB] Connection closed");
  }
}
