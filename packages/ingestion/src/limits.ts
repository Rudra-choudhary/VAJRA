/**
 * Ingestion-local I/O and security limits.
 *
 * NOTE: These limits govern network transport and archive extraction
 * BEFORE a Snapshot is constructed.
 *
 * Engine-wide analysis limits (such as maxEntries and maxTextBytes) are NOT
 * redefined here; they are provided by `context.limits` at runtime.
 */
export const INGESTION_LIMITS = {
  /** Maximum compressed download or upload size in bytes (25 MiB). */
  MAX_COMPRESSED_BYTES: 25 * 1024 * 1024,

  /** Maximum expanded uncompressed archive payload across all entries in bytes (100 MiB). */
  MAX_EXPANDED_BYTES: 100 * 1024 * 1024,

  /** Maximum size for a single uncompressed archive entry in bytes (5 MiB). */
  MAX_ENTRY_BYTES: 5 * 1024 * 1024,

  /** Maximum directory nesting depth (segment count) permitted in archive paths. */
  MAX_DEPTH: 32,

  /** Network request timeout in milliseconds (30 seconds). */
  NETWORK_TIMEOUT_MS: 30_000,

  /** Maximum permitted HTTP redirect hops. */
  MAX_REDIRECTS: 3,

  /**
   * Maximum compression expansion ratio (uncompressed : compressed).
   * Guard against archive decompression bombs (e.g. gzip bombs).
   * Evaluated only after EXPANSION_RATIO_MIN_BYTES has been expanded.
   *
   * Note: This heuristic may reject valid, highly repetitive synthetic packages
   * or zero-filled data files whose uncompressed size vastly exceeds compressed bytes.
   */
  MAX_EXPANSION_RATIO: 100,

  /**
   * Expansion threshold (1 MiB) before decompression ratio checks are enforced.
   * Prevents false positives on tiny compressed headers or metadata.
   */
  EXPANSION_RATIO_MIN_BYTES: 1 * 1024 * 1024,

  /**
   * Minimum fixed floor for total tar headers encountered during extraction.
   * The effective header limit is calculated as:
   * Math.max(INGESTION_LIMITS.MIN_MAX_HEADERS, 2 * maxFileEntries)
   */
  MIN_MAX_HEADERS: 1000,
} as const;

/**
 * Calculates the total header cap permitted during archive extraction.
 * Protects against archives filled with arbitrary directory or metadata headers.
 * Safely guards against 0, negative numbers, non-integers, and NaN.
 */
export function calculateMaxHeaders(maxFileEntries: number): number {
  const safeCount = Number.isFinite(maxFileEntries) && maxFileEntries > 0
    ? Math.floor(maxFileEntries)
    : 0;
  return Math.max(INGESTION_LIMITS.MIN_MAX_HEADERS, 2 * safeCount);
}
