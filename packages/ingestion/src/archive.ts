import { createGunzip } from "node:zlib";
import { Transform, type Readable } from "node:stream";
import { Parser as TarParser } from "tar";
import { IngestionError } from "./errors.js";
import { INGESTION_LIMITS, calculateMaxHeaders } from "./limits.js";
import { validateArchivePath, normalizePathKey } from "./validate.js";

export interface ParseArchiveOptions {
  /** Maximum number of file entries permitted from context.limits.maxEntries */
  maxEntries: number;
  /** Optional cancellation signal */
  signal?: AbortSignal;
}

/**
 * Parses a compressed tar.gz (.tgz) stream in-memory without ever extracting or writing to disk.
 *
 * Enforces real-time streaming security checks and aborts at the first violation:
 * - Counts every single header (files, directories, links, etc.) against a total header limit.
 * - Rejects any entry that is not a regular file (symlinks, hardlinks, devices, fifos -> UNSAFE_ARCHIVE_ENTRY).
 * - Skips directory entries safely.
 * - Accepts legacy regular files (OldFile / '0' / 'File').
 * - Validates logical paths (no traversal, no colons, no backslashes, no control chars, max depth).
 * - Disallows duplicate entry paths, including case-folding and Unicode normalization collisions.
 * - Enforces per-entry uncompressed size limit, total expanded size limit, and expansion-ratio cap.
 * - Handles gunzip and tar stream corruption as INVALID_ARCHIVE.
 * - Destroys/aborts all streams immediately on error or AbortSignal.
 */
export async function parseTarGzStream(
  sourceStream: Readable,
  options: ParseArchiveOptions,
): Promise<Map<string, Buffer>> {
  if (options.signal?.aborted) {
    throw new IngestionError("NETWORK_ERROR", "Operation was aborted", true);
  }

  return new Promise<Map<string, Buffer>>((resolve, reject) => {
    let settled = false;
    let compressedBytes = 0;
    let totalExpandedBytes = 0;
    let totalHeaders = 0;
    const maxHeaders = calculateMaxHeaders(options.maxEntries);
    const entries = new Map<string, Buffer>();
    const seenNormalizedKeys = new Set<string>();

    const gunzip = createGunzip();
    const tarParser = new TarParser();

    // Byte counter transform stream to track compressed input bytes
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        compressedBytes += chunk.length;
        if (compressedBytes > INGESTION_LIMITS.MAX_COMPRESSED_BYTES) {
          cleanup(
            new IngestionError(
              "ARCHIVE_LIMIT_EXCEEDED",
              `Compressed archive exceeds size limit of ${INGESTION_LIMITS.MAX_COMPRESSED_BYTES} bytes: ${compressedBytes}`,
            ),
          );
          return;
        }
        callback(null, chunk);
      },
    });

    function cleanup(err?: Error) {
      if (settled) return;
      settled = true;

      if (options.signal) {
        options.signal.removeEventListener("abort", onAbort);
      }

      try {
        sourceStream.unpipe(counter);
        counter.unpipe(gunzip);
        gunzip.unpipe(tarParser);
      } catch {
        // ignore unpipe errors during cleanup
      }

      if (err) {
        try {
          tarParser.abort(err.message);
        } catch {
          // ignore parser abort failure
        }
      }

      sourceStream.destroy();
      counter.destroy();
      gunzip.destroy();

      if (err) {
        reject(err);
      } else {
        resolve(entries);
      }
    }

    function onAbort() {
      cleanup(
        new IngestionError("NETWORK_ERROR", "Operation was aborted", true),
      );
    }

    if (options.signal) {
      options.signal.addEventListener("abort", onAbort, { once: true });
    }

    sourceStream.on("error", (err) => {
      cleanup(
        err instanceof IngestionError
          ? err
          : new IngestionError("INVALID_ARCHIVE", `Source stream error: ${err.message}`),
      );
    });

    counter.on("error", (err) => {
      cleanup(
        err instanceof IngestionError
          ? err
          : new IngestionError("INVALID_ARCHIVE", `Counter stream error: ${err.message}`),
      );
    });

    gunzip.on("error", (err) => {
      cleanup(
        new IngestionError("INVALID_ARCHIVE", `Corrupt or invalid gzip stream: ${err.message}`),
      );
    });

    tarParser.on("error", (err: Error) => {
      cleanup(
        new IngestionError("INVALID_ARCHIVE", `Corrupt or invalid tar archive: ${err.message}`),
      );
    });

    tarParser.on("entry", (entry) => {
      if (settled) {
        entry.resume();
        return;
      }

      // Count every header encountered before any checks
      totalHeaders++;
      if (totalHeaders > maxHeaders) {
        cleanup(
          new IngestionError(
            "ARCHIVE_LIMIT_EXCEEDED",
            `Total archive header count (${totalHeaders}) exceeds maximum permitted limit (${maxHeaders})`,
          ),
        );
        entry.resume();
        return;
      }

      const entryType = entry.type;

      // 1. Directory entries are safely skipped
      if (entryType === "Directory" || entryType === "5") {
        entry.resume();
        return;
      }

      // 2. Only regular files accepted; reject symlink, hardlink, device, fifo, etc.
      // Accepts 'File', '0', and legacy 'OldFile' (V7 NUL typeflag mapped by tar to 'File')
      if (entryType !== "File" && entryType !== "0" && entryType !== "OldFile") {
        cleanup(
          new IngestionError(
            "UNSAFE_ARCHIVE_ENTRY",
            `Disallowed entry type "${entryType}" for "${entry.path}": only regular files permitted`,
          ),
        );
        entry.resume();
        return;
      }

      // 3. Path validation (POSIX, traversal, colons, backslashes, depth)
      let validPath: string;
      try {
        validPath = validateArchivePath(entry.path);
      } catch (pathErr) {
        cleanup(pathErr instanceof Error ? pathErr : new Error(String(pathErr)));
        entry.resume();
        return;
      }

      // 4. Duplicate path & case/Unicode collision detection
      const normalizedKey = normalizePathKey(validPath);
      if (seenNormalizedKeys.has(normalizedKey)) {
        cleanup(
          new IngestionError(
            "UNSAFE_ARCHIVE_ENTRY",
            `Duplicate or colliding archive entry path: "${validPath}"`,
          ),
        );
        entry.resume();
        return;
      }
      seenNormalizedKeys.add(normalizedKey);

      // 5. Max file entries limit (context.limits.maxEntries)
      if (entries.size >= options.maxEntries) {
        cleanup(
          new IngestionError(
            "ARCHIVE_LIMIT_EXCEEDED",
            `Archive file entry count exceeds maximum permitted file entries (${options.maxEntries})`,
          ),
        );
        entry.resume();
        return;
      }

      // 6. Accumulate entry data in memory with streaming byte caps
      const chunks: Buffer[] = [];
      let entryBytes = 0;

      entry.on("data", (chunk: Buffer) => {
        if (settled) return;

        entryBytes += chunk.length;
        totalExpandedBytes += chunk.length;

        // Check per-entry cap
        if (entryBytes > INGESTION_LIMITS.MAX_ENTRY_BYTES) {
          cleanup(
            new IngestionError(
              "ARCHIVE_LIMIT_EXCEEDED",
              `Entry "${validPath}" exceeds maximum size of ${INGESTION_LIMITS.MAX_ENTRY_BYTES} bytes: ${entryBytes}`,
            ),
          );
          entry.resume();
          return;
        }

        // Check total expanded cap
        if (totalExpandedBytes > INGESTION_LIMITS.MAX_EXPANDED_BYTES) {
          cleanup(
            new IngestionError(
              "ARCHIVE_LIMIT_EXCEEDED",
              `Total expanded archive size exceeds limit of ${INGESTION_LIMITS.MAX_EXPANDED_BYTES} bytes: ${totalExpandedBytes}`,
            ),
          );
          entry.resume();
          return;
        }

        // Check decompression ratio bomb protection
        if (totalExpandedBytes > INGESTION_LIMITS.EXPANSION_RATIO_MIN_BYTES) {
          const effectiveCompressed = Math.max(compressedBytes, 1024);
          const ratio = totalExpandedBytes / effectiveCompressed;
          if (ratio > INGESTION_LIMITS.MAX_EXPANSION_RATIO) {
            cleanup(
              new IngestionError(
                "ARCHIVE_LIMIT_EXCEEDED",
                `Decompression ratio (${ratio.toFixed(1)}:1) exceeds safety limit of ${INGESTION_LIMITS.MAX_EXPANSION_RATIO}:1`,
              ),
            );
            entry.resume();
            return;
          }
        }

        chunks.push(chunk);
      });

      entry.on("end", () => {
        if (settled) return;
        entries.set(validPath, Buffer.concat(chunks));
      });

      entry.on("error", (entryErr: Error) => {
        cleanup(
          new IngestionError(
            "INVALID_ARCHIVE",
            `Error reading entry "${validPath}": ${entryErr.message}`,
          ),
        );
      });
    });

    tarParser.on("end", () => {
      cleanup();
    });

    sourceStream.pipe(counter).pipe(gunzip).pipe(tarParser);
  });
}
