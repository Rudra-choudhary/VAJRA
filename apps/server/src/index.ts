import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { analyze, createOllamaClient } from "@vajra/engine";
import { createStorage } from "@vajra/storage";
import { renderMarkdown } from "@vajra/reports";
import { AnalysisRequestSchema, IdSchema } from "@vajra/contracts";
import type { AnalysisJob, ApiError, WatchEntry } from "@vajra/contracts";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
const DB_PATH = process.env.VAJRA_DB ?? "./data/vajra.db";
const UPLOAD_DIR = process.env.VAJRA_UPLOADS ?? "./data/uploads";
const WORKSPACE = process.env.VAJRA_WORKSPACE ?? "./data/workspaces";

mkdirSync(UPLOAD_DIR, { recursive: true });
mkdirSync(WORKSPACE, { recursive: true });

const storage = createStorage(DB_PATH);

const ingestion = {
  async fetchNpmArtifact() {
    throw new Error("npm retrieval not implemented (owner B)");
  },
  async fetchGithubSnapshot() {
    throw new Error("github snapshot not implemented (owner B)");
  },
  async inspectUploadedArchive() {
    throw new Error("archive inspection not implemented (owner B)");
  },
};

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
    return { error: { code: "BAD_REQUEST", message: "missing file", retryable: false } };
  }
  const purpose = (part.fields as any)?.purpose?.value ?? "package";
  const id = randomUUID();
  const path = join(UPLOAD_DIR, id);
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
    return { error: { code: "INVALID_REQUEST", message: parsed.error.message, retryable: false } };
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
      const report = await analyze(parsed.data, {
        analysisId: id,
        ingestion: ingestion as any,
        workspaceDir: join(WORKSPACE, id),
        resolveUpload: async (uploadId: string) => join(UPLOAD_DIR, uploadId),
        saveFileDetail: async (aid, detail) => {
          storage.saveFileDetail(aid, detail.file.id, detail);
        },
        model: createOllamaClient({ model: process.env.VAJRA_MODEL ?? "qwen2.5-coder:7b" }),
      }, async (stage) => {
        j.stage = stage;
        storage.saveJob(j);
      });
      storage.saveReport(report);
      j.report = report;
      j.status = report.status === "completed" ? "completed" : "partial";
      j.stage = "done";
      storage.saveJob(j);
    } catch (e: any) {
      const err: ApiError = { code: "ANALYSIS_FAILED", message: e?.message ?? "failed", retryable: true };
      j.status = "failed";
      j.error = err;
      storage.saveJob(j);
    }
  });
  reply.code(202);
  return { id, status: "queued" };
});

app.get("/api/analyses/:id", async (req, reply) => {
  const id = (req.params as any).id;
  const job = jobs.get(id) ?? storage.getJob(id);
  if (!job) {
    reply.code(404);
    return { error: { code: "NOT_FOUND", message: "job not found", retryable: false } };
  }
  jobs.set(id, job);
  return job;
});

app.get("/api/analyses", async (req) => {
  const limit = Number((req.query as any)?.limit ?? 20);
  const cursor = (req.query as any)?.cursor ?? null;
  const { items } = storage.listJobs(limit, cursor);
  return { items: items.map((j) => ({
    id: j.id,
    name: j.report?.artifact?.name,
    version: j.report?.artifact?.version,
    status: j.status,
    createdAt: j.report?.createdAt ?? new Date().toISOString(),
    findingCount: j.report?.findings?.length ?? 0,
  })), nextCursor: null };
});

app.get("/api/analyses/:id/files/:fileId", async (req, reply) => {
  const { id, fileId } = req.params as any;
  const detail = storage.getFileDetail(id, fileId);
  if (!detail) {
    reply.code(404);
    return { error: { code: "NOT_FOUND", message: "file not found", retryable: false } };
  }
  return detail;
});

app.get("/api/analyses/:id/export", async (req, reply) => {
  const id = (req.params as any).id;
  const format = (req.query as any)?.format ?? "json";
  const report = storage.getReport(id);
  if (!report) {
    reply.code(404);
    return { error: { code: "NOT_FOUND", message: "report not found", retryable: false } };
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

// interrupted jobs on startup
for (const j of storage.listJobs(1000, null).items) {
  if (j.status === "running" || j.status === "queued") {
    j.status = "failed";
    j.error = { code: "INTERRUPTED", message: "server restarted", retryable: true };
    storage.saveJob(j);
  }
}

app.listen({ port: PORT, host: HOST }).then(() => {
  app.log.info(`Vajra server listening on ${HOST}:${PORT}`);
});