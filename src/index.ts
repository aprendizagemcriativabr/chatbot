import "dotenv/config";

import { app } from "./app";
import { persistenceProvider } from "./persistence/index.js";

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  await persistenceProvider.connect();

  app.listen(PORT, () => {
    console.info(`[Server] Running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("[Server] Failed to start:", err);
});
