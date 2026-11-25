import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { createWriteStream, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ServerConfig } from "../config.js";
import { sendError } from "../errors.js";

function extractPurpose(fields: unknown): "package" | "source" | null {
  if (!fields || typeof fields !== "object") return null;
  const purposeField = (fields as Record<string, unknown>).purpose;
  if (!purposeField || typeof purposeField !== "object") return null;
  const value = (purposeField as Record<string, unknown>).value;
  return value === "package" || value === "source" ? value : null;
}

/** Registers archive upload routes. */
export function registerUploadRoutes(
  app: FastifyInstance,
  config: ServerConfig,
): void {
  /** Upload a package or source .tgz archive and receive an uploadId handle. */
  app.post("/api/uploads", async (req, reply) => {
    const part = await req.file();
    if (!part) {
      return sendError(reply, 400, "BAD_REQUEST", "missing file");
    }

    const purpose = extractPurpose(part.fields);
    if (!purpose) {
      return sendError(
        reply,
        400,
        "INVALID_REQUEST",
        "purpose must be package or source",
      );
    }

    const id = randomUUID();
    const purposeDir = join(config.uploadDir, purpose);
    mkdirSync(purposeDir, { recursive: true });
    const filePath = join(purposeDir, id);

    const ws = createWriteStream(filePath);
    await new Promise<void>((res, rej) => {
      part.file.pipe(ws);
      part.file.on("end", () => res());
      part.file.on("error", rej);
    });

    const sizeBytes = statSync(filePath).size;
    reply.code(201);
    return { uploadId: id, filename: part.filename, sizeBytes };
  });
}
