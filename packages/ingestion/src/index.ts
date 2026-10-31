import type {
  IngestionAdapter,
  AdapterContext,
  AnalysisRequest,
  ArtifactSnapshot,
  SourceSnapshot,
} from "@vajra/contracts";
import { fetchNpmArtifact } from "./npm.js";
import { inspectUploadedArchive } from "./upload.js";
import { fetchGithubSnapshot, resolveGithubRef } from "./github.js";

export { IngestionError, type IngestionErrorCode } from "./errors.js";
export { INGESTION_LIMITS, calculateMaxHeaders } from "./limits.js";
export {
  validateUrl,
  validateCommit,
  parseGithubRepoUrl,
  validateArchivePath,
  normalizePathKey,
  HTTPS_ALLOWLIST,
} from "./validate.js";
export { parseTarGzStream } from "./archive.js";
export {
  buildArtifactSnapshot,
  buildSourceSnapshot,
  truncateUtf8,
} from "./snapshot.js";
export { fetchNpmArtifact } from "./npm.js";
export { inspectUploadedArchive } from "./upload.js";
export { fetchGithubSnapshot, resolveGithubRef } from "./github.js";

export interface CreateIngestionAdapterOptions {
  fetch?: typeof fetch;
}

/**
 * Creates an IngestionAdapter conforming strictly to @vajra/contracts.
 */
export function createIngestionAdapter(
  options?: CreateIngestionAdapterOptions,
): IngestionAdapter {
  return {
    async fetchNpmArtifact(
      input: Extract<AnalysisRequest["artifact"], { kind: "npm" }>,
      context: AdapterContext,
    ): Promise<ArtifactSnapshot> {
      return fetchNpmArtifact(input, context, options);
    },

    async fetchGithubSnapshot(
      input: { repositoryUrl: string; commit: string },
      context: AdapterContext,
    ): Promise<SourceSnapshot> {
      return fetchGithubSnapshot(input, context);
    },

    inspectUploadedArchive: (async (
      input:
        | { uploadId: string; purpose: "package" }
        | { uploadId: string; purpose: "source" },
      context: AdapterContext,
    ): Promise<ArtifactSnapshot | SourceSnapshot> => {
      if (input.purpose === "package") {
        return inspectUploadedArchive(input, context);
      }
      return inspectUploadedArchive(input, context);
    }) as IngestionAdapter["inspectUploadedArchive"],

    async resolveGithubRef(
      input: { repositoryUrl: string; ref: string },
      context: AdapterContext,
    ): Promise<string | null> {
      return resolveGithubRef(input, context);
    },
  };
}
