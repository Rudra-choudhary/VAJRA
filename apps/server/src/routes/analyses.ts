import type { FastifyInstance } from "fastify";
import { AnalysisRequestSchema } from "@vajra/contracts";
import { renderMarkdown } from "@vajra/reports";
import type { Storage } from "@vajra/storage";
import type { JobManager } from "../queue.js";
import { sendError } from "../errors.js";

/** Registers analysis submission, status, listing, file-detail, and export routes. */
export function registerAnalysisRoutes(
  app: FastifyInstance,
  deps: { storage: Storage; jobManager: JobManager },
): void {
  const { storage, jobManager } = deps;

  /** Queue a new package integrity analysis job. */
  app.post("/api/analyses", async (req, reply) => {
    const parsed = AnalysisRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, "INVALID_REQUEST", parsed.error.message);
    }

    const job = jobManager.submit(parsed.data);
    reply.code(202);
    return { id: job.id, status: job.status, stage: job.stage };
  });

  /** Retrieve the current state (and report if terminal) of an analysis job. */
  app.get<{ Params: { id: string } }>(
    "/api/analyses/:id",
    async (req, reply) => {
      const job = jobManager.get(req.params.id);
      if (!job) {
        return sendError(reply, 404, "NOT_FOUND", "job not found");
      }
      return job;
    },
  );

  /** List past analysis jobs, newest first. */
  app.get<{ Querystring: { limit?: string; cursor?: string } }>(
    "/api/analyses",
    async (req) => {
      const limit = Number(req.query.limit ?? 20);
      const cursor = req.query.cursor ?? null;
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
    },
  );

  /** Retrieve the full text/diff detail for a single file in an analysis. */
  app.get<{ Params: { id: string; fileId: string } }>(
    "/api/analyses/:id/files/:fileId",
    async (req, reply) => {
      const { id, fileId } = req.params;
      const detail = storage.getFileDetail(id, fileId);
      if (!detail) {
        return sendError(reply, 404, "NOT_FOUND", "file not found");
      }
      return detail;
    },
  );

  /** Export a completed or partial analysis report as JSON or Markdown. */
  app.get<{ Params: { id: string }; Querystring: { format?: string } }>(
    "/api/analyses/:id/export",
    async (req, reply) => {
      const { id } = req.params;
      const format = req.query.format ?? "json";
      const report = storage.getReport(id);
      if (!report) {
        return sendError(reply, 404, "NOT_FOUND", "report not found");
      }
      if (format === "markdown") {
        reply.header("content-type", "text/markdown");
        reply.header("content-disposition", `attachment; filename="${id}.md"`);
        return renderMarkdown(report);
      }
      reply.header("content-type", "application/json");
      reply.header("content-disposition", `attachment; filename="${id}.json"`);
      return report;
    },
  );
}
