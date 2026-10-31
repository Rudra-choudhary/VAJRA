import { Readable } from "node:stream";
import type { AdapterContext, SourceSnapshot } from "@vajra/contracts";
import { IngestionError } from "./errors.js";
import { INGESTION_LIMITS } from "./limits.js";
import { parseTarGzStream } from "./archive.js";
import { buildSourceSnapshot } from "./snapshot.js";
import { parseGithubRepoUrl, validateCommit } from "./validate.js";
import { safeFetch } from "./npm.js";

const fetcher = typeof fetch === "function" ? fetch : undefined;

export async function fetchGithubSnapshot(
  input: { repositoryUrl: string; commit: string },
  context: AdapterContext,
  options?: { fetch?: typeof fetch },
): Promise<SourceSnapshot> {
  const repo = parseGithubRepoUrl(input.repositoryUrl);
  const commit = validateCommit(input.commit);
  const download = `https://codeload.github.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/tar.gz/${commit}`;
  const fetched = await safeFetch(
    download,
    options?.fetch ?? fetcher ?? fetch,
    context.signal,
    INGESTION_LIMITS.MAX_COMPRESSED_BYTES,
  );
  const files = await parseTarGzStream(Readable.from(fetched.buffer), {
    maxEntries: context.limits.maxEntries,
    signal: context.signal,
  });
  // GitHub archives include a generated top-level directory. Strip only that
  // single wrapper; path validation was already performed by the tar reader.
  const first = files.keys().next().value as string | undefined;
  const prefix = first?.split("/")[0];
  if (!prefix)
    throw new IngestionError("INVALID_ARCHIVE", "GitHub archive is empty");
  const normalized = new Map<string, Buffer>();
  for (const [path, content] of files) {
    const relative = path.startsWith(`${prefix}/`)
      ? path.slice(prefix.length + 1)
      : path;
    if (relative) normalized.set(relative, content);
  }
  if (!normalized.size)
    throw new IngestionError(
      "INVALID_ARCHIVE",
      "GitHub source archive contains no files",
    );
  return buildSourceSnapshot(normalized, repo.normalizedUrl, commit);
}

export async function resolveGithubRef(
  input: { repositoryUrl: string; ref: string },
  context: AdapterContext,
  options?: { fetch?: typeof fetch },
): Promise<string | null> {
  const repo = parseGithubRepoUrl(input.repositoryUrl);
  if (!input.ref || input.ref.length > 200 || input.ref.startsWith("-")) {
    throw new IngestionError("INVALID_INPUT", "Invalid Git reference");
  }
  const url = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/commits/${encodeURIComponent(input.ref)}`;
  try {
    const response = await (options?.fetch ?? fetcher ?? fetch)(url, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "vajra-ingestion/0.1.0",
      },
      redirect: "error",
      signal: AbortSignal.any([
        context.signal,
        AbortSignal.timeout(INGESTION_LIMITS.NETWORK_TIMEOUT_MS),
      ]),
    });
    if (response.status === 404) return null;
    if (!response.ok)
      throw new IngestionError(
        "HTTP_ERROR",
        `GitHub ref lookup returned HTTP ${response.status}`,
        response.status >= 500,
      );
    const body: unknown = await response.json();
    const sha =
      body && typeof body === "object"
        ? (body as { sha?: unknown }).sha
        : undefined;
    if (typeof sha !== "string")
      throw new IngestionError(
        "INVALID_INPUT",
        "GitHub ref response did not include a commit SHA",
      );
    return validateCommit(sha.toLowerCase());
  } catch (error) {
    if (error instanceof IngestionError) throw error;
    if (context.signal.aborted)
      throw new IngestionError(
        "NETWORK_ERROR",
        "GitHub ref lookup cancelled",
        true,
      );
    throw new IngestionError(
      "NETWORK_ERROR",
      `GitHub ref lookup failed: ${(error as Error).message}`,
      true,
    );
  }
}
