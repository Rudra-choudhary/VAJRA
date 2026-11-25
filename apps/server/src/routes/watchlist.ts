import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import type { WatchEntry } from "@vajra/contracts";
import type { Storage } from "@vajra/storage";
import { sendError } from "../errors.js";

/** Registers package watchlist and release-monitoring routes. */
export function registerWatchlistRoutes(
  app: FastifyInstance,
  storage: Storage,
): void {
  /** List all watched npm packages. */
  app.get("/api/watchlist", async () => ({ items: storage.listWatch() }));

  /** Add a package to the watchlist (idempotent by package name). */
  app.post<{ Body: { name?: unknown } }>(
    "/api/watchlist",
    async (req, reply) => {
      const name = typeof req.body?.name === "string" ? req.body.name : "";
      if (!name) {
        return sendError(
          reply,
          400,
          "INVALID_REQUEST",
          "package name is required",
        );
      }
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
    },
  );

  /** Remove a package from the watchlist by ID. */
  app.delete<{ Params: { id: string } }>(
    "/api/watchlist/:id",
    async (req, reply) => {
      storage.deleteWatch(req.params.id);
      reply.code(204);
      return null;
    },
  );

  /** Check npm registry for new releases across all watched packages. */
  app.post("/api/monitor/once", async () => {
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
        if (!response.ok) {
          throw new Error(`Registry returned HTTP ${response.status}`);
        }
        const latest = (await response.json()) as { version?: unknown };
        if (typeof latest.version !== "string") {
          throw new Error("Registry latest metadata has no version");
        }
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
            artifact: {
              kind: "npm",
              name: entry.name,
              version: latest.version,
            },
            source: { kind: "auto" },
          },
        });
        if (queued.statusCode !== 202) {
          throw new Error(
            `Analysis queue rejected release (${queued.statusCode})`,
          );
        }
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
}
