import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { randomUUID } from "node:crypto";
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { analyze, createOllamaClient } from "@vajra/engine";
import { createIngestionAdapter, IngestionError } from "@vajra/ingestion";
import { createStorage } from "@vajra/storage";
import { renderMarkdown } from "@vajra/reports";
import { AnalysisRequestSchema } from "@vajra/contracts";
import type { AnalysisJob, ApiError, WatchEntry } from "@vajra/contracts";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
const DB_PATH = process.env.VAJRA_DB ?? "./data/vajra.db";
const UPLOAD_DIR = process.env.VAJRA_UPLOADS ?? "./data/uploads";
const WORKSPACE = process.env.VAJRA_WORKSPACE ?? "./data/workspaces";

mkdirSync(UPLOAD_DIR, { recursive: true });
mkdirSync(WORKSPACE, { recursive: true });

const storage = createStorage(DB_PATH);

const ingestion = createIngestionAdapter();

const jobs = new Map<string, AnalysisJob>();
let queue: Promise<void> = Promise.resolve();

function enqueue(fn: () => Promise<void>) {
  queue = queue.then(fn).catch(() => {});
}

const app = Fastify({ logger: true });
await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });

app.get("/api/health", async () => ({ status: "ok" }));

app.post("/api/uploads", async (req, reply) => {
  const part = await req.file();
  if (!part) {
    reply.code(400);
    return {
      error: { code: "BAD_REQUEST", message: "missing file", retryable: false },
    };
  }
  const purpose = (part.fields as any)?.purpose?.value;
  if (purpose !== "package" && purpose !== "source") {
    reply.code(400);
    return {
      error: {
        code: "INVALID_REQUEST",
        message: "purpose must be package or source",
        retryable: false,
      },
    };
  }
  const id = randomUUID();
  const purposeDir = join(UPLOAD_DIR, purpose);
  mkdirSync(purposeDir, { recursive: true });
  const path = join(purposeDir, id);
  const { createWriteStream } = await import("node:fs");
  const ws = createWriteStream(path);
  await new Promise<void>((res, rej) => {
    part.file.pipe(ws);
    part.file.on("end", () => res());
    part.file.on("error", rej);
  });
  const sizeBytes = (await import("node:fs")).statSync(path).size;
  reply.code(201);
  return { uploadId: id, filename: part.filename, sizeBytes };
});

app.post("/api/analyses", async (req, reply) => {
  const parsed = AnalysisRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    reply.code(400);
    return {
      error: {
        code: "INVALID_REQUEST",
        message: parsed.error.message,
        retryable: false,
      },
    };
  }
  const id = randomUUID();
  const job: AnalysisJob = { id, status: "queued", stage: "queued" };
  jobs.set(id, job);
  storage.saveJob(job);
  enqueue(async () => {
    const j = jobs.get(id)!;
    j.status = "running";
    j.stage = "retrieving";
    storage.saveJob(j);
    try {
      const report = await analyze(
        parsed.data,
        {
          analysisId: id,
          ingestion,
          workspaceDir: join(WORKSPACE, id),
          resolveUpload: async (uploadId, purpose) => {
            if (!/^[0-9a-f-]{36}$/i.test(uploadId))
              throw new IngestionError(
                "UPLOAD_NOT_FOUND",
                "Invalid upload handle",
              );
            const path = join(UPLOAD_DIR, purpose, uploadId);
            try {
              if (!statSync(path).isFile()) throw new Error("not a file");
            } catch {
              throw new IngestionError(
                "UPLOAD_NOT_FOUND",
                "Upload handle is missing or has the wrong purpose",
              );
            }
            return path;
          },
          saveFileDetail: async (aid, detail) => {
            storage.saveFileDetail(aid, detail.file.id, detail);
          },
          ...(process.env.VAJRA_MODEL
            ? { model: createOllamaClient({ model: process.env.VAJRA_MODEL }) }
            : {}),
        },
        async (stage) => {
          j.stage = stage;
          storage.saveJob(j);
        },
      );
      storage.saveReport(report);
      j.report = report;
      j.status = report.status === "completed" ? "completed" : "partial";
      j.stage = "done";
      storage.saveJob(j);
      const watched = storage
        .listWatch()
        .find((entry) => entry.name === report.artifact.name);
      if (watched)
        storage.upsertWatch({
          ...watched,
          lastCheckedAt: report.createdAt,
          lastVersion: report.artifact.version ?? null,
          lastDigest: report.artifact.sha256,
          lastAnalysisId: report.id,
          lastError: null,
        });
    } catch (e: any) {
      const err: ApiError =
        e instanceof IngestionError
          ? e.toApiError()
          : {
              code: e?.code ?? "ANALYSIS_FAILED",
              message: e?.message ?? "failed",
              retryable: Boolean(e?.retryable),
            };
      j.status = "failed";
      j.error = err;
      storage.saveJob(j);
    }
  });
  reply.code(202);
  return { id, status: "queued", stage: "queued" };
});

app.get("/api/analyses/:id", async (req, reply) => {
  const id = (req.params as any).id;
  const job = jobs.get(id) ?? storage.getJob(id);
  if (!job) {
    reply.code(404);
    return {
      error: { code: "NOT_FOUND", message: "job not found", retryable: false },
    };
  }
  jobs.set(id, job);
  return job;
});

app.get("/api/analyses", async (req) => {
  const limit = Number((req.query as any)?.limit ?? 20);
  const cursor = (req.query as any)?.cursor ?? null;
  const { items } = storage.listJobs(limit, cursor);
  return {
    items: items.map((j) => ({
      id: j.id,
      name: j.report?.artifact?.name,
      version: j.report?.artifact?.version,
      status: j.status,
      createdAt: j.report?.createdAt ?? new Date().toISOString(),
      findingCount: j.report?.findings?.length ?? 0,
    })),
    nextCursor: null,
  };
});

app.get("/api/analyses/:id/files/:fileId", async (req, reply) => {
  const { id, fileId } = req.params as any;
  const detail = storage.getFileDetail(id, fileId);
  if (!detail) {
    reply.code(404);
    return {
      error: { code: "NOT_FOUND", message: "file not found", retryable: false },
    };
  }
  return detail;
});

app.get("/api/analyses/:id/export", async (req, reply) => {
  const id = (req.params as any).id;
  const format = (req.query as any)?.format ?? "json";
  const report = storage.getReport(id);
  if (!report) {
    reply.code(404);
    return {
      error: {
        code: "NOT_FOUND",
        message: "report not found",
        retryable: false,
      },
    };
  }
  if (format === "markdown") {
    reply.header("content-type", "text/markdown");
    reply.header("content-disposition", `attachment; filename="${id}.md"`);
    return renderMarkdown(report);
  }
  reply.header("content-type", "application/json");
  reply.header("content-disposition", `attachment; filename="${id}.json"`);
  return report;
});

app.get("/api/watchlist", async () => ({ items: storage.listWatch() }));

app.post("/api/watchlist", async (req, reply) => {
  const name = (req.body as any)?.name;
  const existing = storage.listWatch().find((w) => w.name === name);
  if (existing) {
    reply.code(200);
    return existing;
  }
  const entry: WatchEntry = {
    id: randomUUID(),
    name,
    lastCheckedAt: null,
    lastVersion: null,
    lastDigest: null,
    lastAnalysisId: null,
    lastError: null,
  };
  storage.upsertWatch(entry);
  reply.code(201);
  return entry;
});

app.delete("/api/watchlist/:id", async (req, reply) => {
  storage.deleteWatch((req.params as any).id);
  reply.code(204);
  return null;
});

app.post("/api/monitor/once", async (req, reply) => {
  const outcomes: Array<{
    name: string;
    status: string;
    version?: string;
    error?: string;
  }> = [];
  for (const entry of storage.listWatch()) {
    try {
      const response = await fetch(
        `https://registry.npmjs.org/${encodeURIComponent(entry.name)}/latest`,
        {
          headers: { accept: "application/json" },
          redirect: "error",
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (!response.ok)
        throw new Error(`Registry returned HTTP ${response.status}`);
      const latest = (await response.json()) as { version?: unknown };
      if (typeof latest.version !== "string")
        throw new Error("Registry latest metadata has no version");
      if (latest.version === entry.lastVersion) {
        storage.upsertWatch({
          ...entry,
          lastCheckedAt: new Date().toISOString(),
          lastError: null,
        });
        outcomes.push({
          name: entry.name,
          status: "unchanged",
          version: latest.version,
        });
        continue;
      }
      const queued = await app.inject({
        method: "POST",
        url: "/api/analyses",
        payload: {
          artifact: { kind: "npm", name: entry.name, version: latest.version },
          source: { kind: "auto" },
        },
      });
      if (queued.statusCode !== 202)
        throw new Error(
          `Analysis queue rejected release (${queued.statusCode})`,
        );
      storage.upsertWatch({
        ...entry,
        lastCheckedAt: new Date().toISOString(),
        lastError: null,
      });
      outcomes.push({
        name: entry.name,
        status: "queued",
        version: latest.version,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Monitor check failed";
      storage.upsertWatch({
        ...entry,
        lastCheckedAt: new Date().toISOString(),
        lastError: { code: "MONITOR_ERROR", message, retryable: true },
      });
      outcomes.push({ name: entry.name, status: "failed", error: message });
    }
  }
  return { items: outcomes };
});

// interrupted jobs on startup
for (const j of storage.listJobs(1000, null).items) {
  if (j.status === "running" || j.status === "queued") {
    j.status = "failed";
    j.error = {
      code: "INTERRUPTED",
      message: "server restarted",
      retryable: true,
    };
    storage.saveJob(j);
  }
}

app.listen({ port: PORT, host: HOST }).then(() => {
  app.log.info(`Vajra server listening on ${HOST}:${PORT}`);
});
