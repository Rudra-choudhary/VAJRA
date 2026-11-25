import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { mkdirSync } from "node:fs";
import { createIngestionAdapter } from "@vajra/ingestion";
import { createStorage } from "@vajra/storage";
import { loadConfig } from "./config.js";
import { createJobManager } from "./queue.js";
import { registerUploadRoutes } from "./routes/uploads.js";
import { registerAnalysisRoutes } from "./routes/analyses.js";
import { registerWatchlistRoutes } from "./routes/watchlist.js";

const config = loadConfig();

mkdirSync(config.uploadDir, { recursive: true });
mkdirSync(config.workspaceDir, { recursive: true });

const app = Fastify({ logger: true });
await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });

const storage = createStorage(config.dbPath);
const ingestion = createIngestionAdapter();
const jobManager = createJobManager({
  config,
  storage,
  ingestion,
  logger: app.log,
});

// Recover any jobs left in-flight from a prior server run
jobManager.recoverInterrupted();

// Register route modules
app.get("/api/health", async () => ({ status: "ok" }));
registerUploadRoutes(app, config);
registerAnalysisRoutes(app, { storage, jobManager });
registerWatchlistRoutes(app, storage);

app.listen({ port: config.port, host: config.host }).then(() => {
  app.log.info(`Vajra server listening on ${config.host}:${config.port}`);
});
