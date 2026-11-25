import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { join } from "node:path";
import type { FastifyBaseLogger } from "fastify";
import { analyze, createOllamaClient } from "@vajra/engine";
import { IngestionError } from "@vajra/ingestion";
import type { IngestionAdapter, AnalysisJob, AnalysisRequest } from "@vajra/contracts";
import type { Storage } from "@vajra/storage";
import type { ServerConfig } from "./config.js";
import { toApiError } from "./errors.js";

export interface JobManager {
  submit(request: AnalysisRequest): AnalysisJob;
  get(id: string): AnalysisJob | null;
  recoverInterrupted(): void;
}

/**
 * Creates a sequential in-process analysis job queue backed by SQLite storage.
 */
export function createJobManager(deps: {
  config: ServerConfig;
  storage: Storage;
  ingestion: IngestionAdapter;
  logger: FastifyBaseLogger;
}): JobManager {
  const { config, storage, ingestion, logger } = deps;
  const jobs = new Map<string, AnalysisJob>();
  let queue: Promise<void> = Promise.resolve();

  function enqueue(fn: () => Promise<void>): void {
    queue = queue.then(fn).catch((err) => {
      logger.error(err, "Unhandled error in background analysis queue");
    });
  }

  async function resolveUpload(
    uploadId: string,
    purpose: "package" | "source",
  ): Promise<string> {
    if (!/^[0-9a-f-]{36}$/i.test(uploadId)) {
      throw new IngestionError("UPLOAD_NOT_FOUND", "Invalid upload handle");
    }
    const uploadPath = join(config.uploadDir, purpose, uploadId);
    try {
      if (!statSync(uploadPath).isFile()) throw new Error("not a file");
    } catch {
      throw new IngestionError(
        "UPLOAD_NOT_FOUND",
        "Upload handle is missing or has the wrong purpose",
      );
    }
    return uploadPath;
  }

  async function runJob(id: string, request: AnalysisRequest): Promise<void> {
    const activeJob = jobs.get(id)!;
    activeJob.status = "running";
    activeJob.stage = "retrieving";
    storage.saveJob(activeJob);

    try {
      const report = await analyze(
        request,
        {
          analysisId: id,
          ingestion,
          workspaceDir: join(config.workspaceDir, id),
          resolveUpload,
          saveFileDetail: async (aid, detail) => {
            storage.saveFileDetail(aid, detail.file.id, detail);
          },
          ...(config.modelId.toLowerCase() !== "none"
            ? {
                model: createOllamaClient({
                  model: config.modelId,
                  baseUrl: config.ollamaUrl,
                }),
              }
            : {}),
        },
        async (stage) => {
          activeJob.stage = stage;
          storage.saveJob(activeJob);
        },
      );

      storage.saveReport(report);
      activeJob.report = report;
      activeJob.status =
        report.status === "completed" ? "completed" : "partial";
      activeJob.stage = "done";
      storage.saveJob(activeJob);

      const watched = storage
        .listWatch()
        .find((entry) => entry.name === report.artifact.name);
      if (watched) {
        storage.upsertWatch({
          ...watched,
          lastCheckedAt: report.createdAt,
          lastVersion: report.artifact.version ?? null,
          lastDigest: report.artifact.sha256,
          lastAnalysisId: report.id,
          lastError: null,
        });
      }
    } catch (err: unknown) {
      activeJob.status = "failed";
      activeJob.error = toApiError(err);
      storage.saveJob(activeJob);
    }
  }

  return {
    submit(request) {
      const id = randomUUID();
      const job: AnalysisJob = { id, status: "queued", stage: "queued" };
      jobs.set(id, job);
      storage.saveJob(job);
      enqueue(() => runJob(id, request));
      return job;
    },

    get(id) {
      const job = jobs.get(id) ?? storage.getJob(id);
      if (job) jobs.set(id, job);
      return job;
    },

    recoverInterrupted() {
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
    },
  };
}
