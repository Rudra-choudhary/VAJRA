import { IngestionError } from "./errors.js";
import { INGESTION_LIMITS } from "./limits.js";

export const HTTPS_ALLOWLIST: ReadonlySet<string> = new Set([
  "registry.npmjs.org",
  "codeload.github.com",
  "api.github.com",
  "github.com",
]);

/**
 * Validates that a string is a valid HTTPS URL targeting an allowlisted host
 * with no custom port, credentials, query parameters, or fragment.
 */
export function validateUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new IngestionError("INVALID_INPUT", `Malformed URL: ${rawUrl}`);
  }

  if (parsed.protocol !== "https:") {
    throw new IngestionError(
      "UNSUPPORTED_HOST",
      `Invalid protocol "${parsed.protocol}"; only https: is supported`,
    );
  }

  if (!HTTPS_ALLOWLIST.has(parsed.hostname)) {
    throw new IngestionError(
      "UNSUPPORTED_HOST",
      `Host "${parsed.hostname}" is not in the HTTPS allowlist`,
    );
  }

  if (parsed.port) {
    throw new IngestionError(
      "UNSUPPORTED_HOST",
      `Custom ports are not permitted: ${parsed.port}`,
    );
  }

  if (parsed.username || parsed.password) {
    throw new IngestionError(
      "INVALID_INPUT",
      "URL credentials (username/password) are not permitted",
    );
  }

  return parsed;
}

const COMMIT_SHA_REGEX = /^[a-f0-9]{40}$/;

/**
 * Validates that a commit string is strictly a 40-character lowercase hexadecimal SHA.
 */
export function validateCommit(commit: string): string {
  if (typeof commit !== "string" || !COMMIT_SHA_REGEX.test(commit)) {
    throw new IngestionError(
      "INVALID_INPUT",
      `Commit must be a full 40-character lowercase hexadecimal SHA: "${commit}"`,
    );
  }
  return commit;
}

export interface ParsedGithubRepo {
  owner: string;
  repo: string;
  normalizedUrl: string;
}

/**
 * Parses and validates an HTTPS github.com repository URL.
 * Strips any trailing .git and trailing slash.
 * Rejects query strings, fragments, and excess path segments.
 */
export function parseGithubRepoUrl(url: string): ParsedGithubRepo {
  const parsed = validateUrl(url);

  if (parsed.hostname !== "github.com") {
    throw new IngestionError(
      "UNSUPPORTED_HOST",
      `GitHub repository URL must target github.com, got "${parsed.hostname}"`,
    );
  }

  if (parsed.search) {
    throw new IngestionError(
      "INVALID_INPUT",
      "GitHub repository URL must not contain query parameters",
    );
  }

  if (parsed.hash) {
    throw new IngestionError(
      "INVALID_INPUT",
      "GitHub repository URL must not contain a URL hash/fragment",
    );
  }

  // Normalize path by trimming leading/trailing slashes
  const trimmedPath = parsed.pathname.replace(/^\/+|\/+$/g, "");
  const segments = trimmedPath.split("/");

  if (segments.length !== 2 || !segments[0] || !segments[1]) {
    throw new IngestionError(
      "INVALID_INPUT",
      `GitHub repository URL path must have exactly owner/repo segments, got "${parsed.pathname}"`,
    );
  }

  const owner = segments[0];
  let repo = segments[1];

  if (repo.endsWith(".git")) {
    repo = repo.slice(0, -4);
  }

  // Segment character sanity checks (standard GitHub owner and repo name chars)
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) {
    throw new IngestionError(
      "INVALID_INPUT",
      `GitHub repository URL contains invalid path characters: "${owner}/${repo}"`,
    );
  }

  const normalizedUrl = `https://github.com/${owner}/${repo}`;

  return {
    owner,
    repo,
    normalizedUrl,
  };
}

/**
 * Validates an archive-relative logical file path against:
 * 1. Contract LogicalPath rules (relative, POSIX, no '\\', no ':', no null/control chars, no empty/./.. segments)
 * 2. Ingestion nesting depth limit (MAX_DEPTH)
 */
export function validateArchivePath(path: string): string {
  if (typeof path !== "string" || path.length === 0) {
    throw new IngestionError(
      "UNSAFE_ARCHIVE_ENTRY",
      "Archive entry path must not be empty",
    );
  }

  if (path.length > 1024) {
    throw new IngestionError(
      "UNSAFE_ARCHIVE_ENTRY",
      `Archive entry path exceeds maximum length of 1024 characters: ${path.length}`,
    );
  }

  if (path.startsWith("/")) {
    throw new IngestionError(
      "UNSAFE_ARCHIVE_ENTRY",
      `Archive entry path must not be absolute: "${path}"`,
    );
  }

  if (path.includes("\\")) {
    throw new IngestionError(
      "UNSAFE_ARCHIVE_ENTRY",
      `Archive entry path must not contain backslashes: "${path}"`,
    );
  }

  if (/[\x00-\x1f\x7f]/.test(path)) {
    throw new IngestionError(
      "UNSAFE_ARCHIVE_ENTRY",
      "Archive entry path contains forbidden control characters",
    );
  }

  if (path.includes(":")) {
    throw new IngestionError(
      "UNSAFE_ARCHIVE_ENTRY",
      `Archive entry path must not contain colons: "${path}"`,
    );
  }

  const segments = path.split("/");

  if (segments.length > INGESTION_LIMITS.MAX_DEPTH) {
    throw new IngestionError(
      "ARCHIVE_LIMIT_EXCEEDED",
      `Archive entry nesting depth (${segments.length}) exceeds maximum of ${INGESTION_LIMITS.MAX_DEPTH}: "${path}"`,
    );
  }

  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") {
      throw new IngestionError(
        "UNSAFE_ARCHIVE_ENTRY",
        `Archive entry path contains invalid segment "${seg}": "${path}"`,
      );
    }
  }

  return path;
}

/**
 * Normalizes an entry path for collision / duplicate detection.
 * Uses Unicode Normalization Form C (NFC) and case folding to detect
 * case-insensitive or Unicode normalization collisions within an archive.
 */
export function normalizePathKey(path: string): string {
  return path.normalize("NFC").toLowerCase();
}

