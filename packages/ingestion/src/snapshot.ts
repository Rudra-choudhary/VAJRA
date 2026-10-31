import { createHash } from "node:crypto";
import type {
  ArtifactSnapshot,
  SourceSnapshot,
  SnapshotEntry,
  TextContent,
  PackageMetadata,
} from "@vajra/contracts";
import { IngestionError } from "./errors.js";

/**
 * Truncates a UTF-8 encoded Buffer to at most `maxBytes` without splitting a multibyte character.
 * Walks back at most 3 bytes to find the lead byte of any uncompleted sequence.
 */
export function truncateUtf8(
  buf: Buffer,
  maxBytes: number,
): { buffer: Buffer; truncated: boolean } {
  const safeLimit = Number.isFinite(maxBytes)
    ? Math.max(0, Math.floor(maxBytes))
    : 0;
  if (buf.length <= safeLimit) {
    return { buffer: buf, truncated: false };
  }

  let end = safeLimit;
  if (end >= buf.length) {
    return { buffer: buf, truncated: false };
  }

  // Walk back at most 3 continuation bytes (0x80..0xBF) to detect a severed lead byte
  let walked = 0;
  while (end > 0 && (buf[end]! & 0xc0) === 0x80 && walked < 3) {
    end--;
    walked++;
  }

  // Slicing subarray(0, end) cleanly excludes the incomplete multibyte sequence
  return { buffer: buf.subarray(0, end), truncated: true };
}

/**
 * Deterministically constructs SnapshotEntry array and the overall snapshot SHA-256 hash.
 *
 * Sorting:
 * Entries are sorted by logical path using plain code-unit ordering (a < b ? -1 : a > b ? 1 : 0).
 *
 * SHA-256 Format:
 * Prefix "vajra-snapshot-v1\n", then one line per sorted entry:
 *   path + "\0" + sizeBytes + "\0" + sha256 + "\n"
 * NOTE: Snapshot metadata and archive root are EXCLUDED from this snapshot SHA-256 calculation.
 */
function createSnapshotCore(files: Map<string, Buffer>): {
  sha256: string;
  entries: readonly SnapshotEntry[];
  readText: (
    path: string,
    maxBytes: number,
    signal?: AbortSignal,
  ) => Promise<TextContent>;
} {
  // Sort paths by UTF-16 code-unit ordering
  const sortedPaths = Array.from(files.keys()).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );

  const entries: readonly SnapshotEntry[] = Object.freeze(
    sortedPaths.map((path) => {
      const content = files.get(path)!;
      const sha256 = createHash("sha256").update(content).digest("hex");
      return Object.freeze({
        path,
        sizeBytes: content.length,
        sha256,
      });
    }),
  );

  // Compute snapshot hash using canonical line-based format
  const hasher = createHash("sha256").update("vajra-snapshot-v1\n");
  for (const entry of entries) {
    hasher.update(`${entry.path}\0${entry.sizeBytes}\0${entry.sha256}\n`);
  }
  const sha256 = hasher.digest("hex");

  const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

  const readText = async (
    path: string,
    maxBytes: number,
    signal?: AbortSignal,
  ): Promise<TextContent> => {
    if (signal?.aborted) {
      if (signal.reason instanceof Error) {
        throw signal.reason;
      }
      throw new DOMException("Aborted", "AbortError");
    }

    const content = files.get(path);
    if (!content) {
      throw new IngestionError(
        "INVALID_INPUT",
        `Requested file does not exist in snapshot: "${path}"`,
      );
    }

    // Step 1: Take the prefix bounded by maxBytes and trim to a valid UTF-8 boundary
    const { buffer: prefixBuffer, truncated } = truncateUtf8(content, maxBytes);

    // If the original content is non-empty and maxBytes > 0, but the trimmed prefix
    // was completely stripped to 0 bytes by walking back continuation bytes,
    // the content prefix consisted exclusively of invalid/severed continuation bytes.
    if (content.length > 0 && maxBytes > 0 && prefixBuffer.length === 0) {
      return {
        text: null,
        binary: true,
        truncated,
      };
    }

    // Step 2: Decide binary on the SAME prefix bytes that will be returned:
    // (a) Contains null byte (\x00)
    if (prefixBuffer.includes(0)) {
      return {
        text: null,
        binary: true,
        truncated,
      };
    }

    // (b) Strict UTF-8 validation on the prefix
    let decodedText: string;
    try {
      decodedText = utf8Decoder.decode(prefixBuffer);
    } catch {
      return {
        text: null,
        binary: true,
        truncated,
      };
    }

    return {
      text: decodedText,
      binary: false,
      truncated,
    };
  };

  return {
    sha256,
    entries,
    readText,
  };
}

/**
 * Builds an ArtifactSnapshot from an in-memory Map of logical paths to file content Buffers.
 *
 * @param files Map of logical path to file buffer
 * @param metadata Exact package metadata from registry release or manifest
 * @param root Archive wrapper prefix (e.g. "package" for standard npm tarballs, or "" if none)
 */
export function buildArtifactSnapshot(
  files: Map<string, Buffer>,
  metadata: PackageMetadata,
  root: string,
): ArtifactSnapshot {
  const core = createSnapshotCore(files);
  return {
    sha256: core.sha256,
    entries: core.entries,
    readText: core.readText,
    metadata,
    root,
  };
}

/**
 * Builds a SourceSnapshot from an in-memory Map of logical paths to file content Buffers.
 *
 * @param files Map of logical path to file buffer
 * @param repositoryUrl Optional verified GitHub repository URL
 * @param commit Optional full 40-character lowercase commit SHA
 */
export function buildSourceSnapshot(
  files: Map<string, Buffer>,
  repositoryUrl?: string,
  commit?: string,
): SourceSnapshot {
  const core = createSnapshotCore(files);
  return {
    sha256: core.sha256,
    entries: core.entries,
    readText: core.readText,
    ...(repositoryUrl !== undefined ? { repositoryUrl } : {}),
    ...(commit !== undefined ? { commit } : {}),
  };
}
