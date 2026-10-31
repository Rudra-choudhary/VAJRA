import { promises as fs } from "node:fs";
import type {
  ArtifactSnapshot,
  SourceSnapshot,
  AdapterContext,
  PackageMetadata,
} from "@vajra/contracts";
import { IngestionError } from "./errors.js";
import { INGESTION_LIMITS } from "./limits.js";
import { parseTarGzStream } from "./archive.js";
import { buildArtifactSnapshot, buildSourceSnapshot } from "./snapshot.js";

function parseManifestMetadata(files: Map<string, Buffer>, root: string): PackageMetadata {
  const manifestPath = root ? `${root}/package.json` : "package.json";
  const manifestBuf = files.get(manifestPath) ?? files.get("package.json");
  if (!manifestBuf) {
    return {};
  }

  try {
    const raw = JSON.parse(manifestBuf.toString("utf8"));
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return {};
    }

    const metadata: PackageMetadata = {};
    if (typeof raw.name === "string") {
      metadata.name = raw.name;
    }
    if (typeof raw.version === "string") {
      metadata.version = raw.version;
    }
    if (typeof raw.gitHead === "string") {
      metadata.gitHead = raw.gitHead;
    }
    if (typeof raw.repository === "string") {
      metadata.repository = { url: raw.repository };
    } else if (typeof raw.repository === "object" && raw.repository !== null) {
      if (typeof raw.repository.url === "string") {
        metadata.repository = {
          url: raw.repository.url,
          ...(typeof raw.repository.directory === "string"
            ? { directory: raw.repository.directory }
            : {}),
        };
      }
    }
    return metadata;
  } catch {
    return {};
  }
}

export async function inspectUploadedArchive(
  input: { uploadId: string; purpose: "package" },
  context: AdapterContext,
): Promise<ArtifactSnapshot>;
export async function inspectUploadedArchive(
  input: { uploadId: string; purpose: "source" },
  context: AdapterContext,
): Promise<SourceSnapshot>;
export async function inspectUploadedArchive(
  input: { uploadId: string; purpose: "package" | "source" },
  context: AdapterContext,
): Promise<ArtifactSnapshot | SourceSnapshot> {
  const resolvedPath = await context.resolveUpload(input.uploadId, input.purpose);

  let handle: fs.FileHandle;
  try {
    handle = await fs.open(resolvedPath, "r");
  } catch (err: unknown) {
    const sysErr = err as NodeJS.ErrnoException;
    if (sysErr.code === "ENOENT") {
      throw new IngestionError(
        "UPLOAD_NOT_FOUND",
        `Upload archive not found for id "${input.uploadId}": ${resolvedPath}`,
      );
    }
    throw new IngestionError(
      "INVALID_INPUT",
      `Failed to open uploaded file "${resolvedPath}": ${sysErr.message}`,
    );
  }

  try {
    const stat = await handle.stat();

    if (!stat.isFile()) {
      throw new IngestionError(
        "UNSAFE_ARCHIVE_ENTRY",
        `Uploaded path is not a regular file: ${resolvedPath}`,
      );
    }

    if (stat.size > INGESTION_LIMITS.MAX_COMPRESSED_BYTES) {
      throw new IngestionError(
        "ARCHIVE_LIMIT_EXCEEDED",
        `Uploaded archive size (${stat.size} bytes) exceeds limit of ${INGESTION_LIMITS.MAX_COMPRESSED_BYTES} bytes`,
      );
    }

    const stream = handle.createReadStream();
    const files = await parseTarGzStream(stream, {
      maxEntries: context.limits.maxEntries,
      signal: context.signal,
    });

    if (input.purpose === "package") {
      const root = files.has("package/package.json") ? "package" : "";
      const metadata = parseManifestMetadata(files, root);
      return buildArtifactSnapshot(files, metadata, root || "package");
    } else {
      return buildSourceSnapshot(files);
    }
  } finally {
    await handle.close();
  }
}

