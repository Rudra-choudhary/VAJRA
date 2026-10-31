import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type {
  ArtifactSnapshot,
  AdapterContext,
  AnalysisRequest,
  PackageMetadata,
} from "@vajra/contracts";
import { IngestionError } from "./errors.js";
import { INGESTION_LIMITS } from "./limits.js";
import { validateUrl } from "./validate.js";
import { parseTarGzStream } from "./archive.js";
import { buildArtifactSnapshot } from "./snapshot.js";

const EXACT_VERSION_REGEX = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const NPM_NAME_REGEX = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

/**
 * Encodes an npm package name for the registry URL path.
 * e.g., "@scope/pkg" -> "@scope%2fpkg"
 */
export function encodePackageName(name: string): string {
  if (name.startsWith("@")) {
    const slashIdx = name.indexOf("/");
    if (slashIdx === -1) {
      throw new IngestionError("INVALID_INPUT", `Invalid scoped package name: ${name}`);
    }
    const scope = name.slice(0, slashIdx);
    const pkg = name.slice(slashIdx + 1);
    return `${encodeURIComponent(scope)}%2f${encodeURIComponent(pkg)}`;
  }
  return encodeURIComponent(name);
}

/**
 * Performs an HTTPS fetch while manually checking every redirect hop against the HTTPS allowlist,
 * capping redirects at MAX_REDIRECTS, and bounding total response bytes.
 */
export async function safeFetch(
  initialUrl: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
  maxBytes: number,
): Promise<{ buffer: Buffer; url: string }> {
  let currentUrl = initialUrl;
  let hops = 0;

  while (true) {
    if (signal.aborted) {
      throw new IngestionError("NETWORK_ERROR", "Fetch was aborted", true);
    }

    validateUrl(currentUrl);

    let res: Response;
    try {
      res = await fetcher(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal,
        headers: {
          "user-agent": "vajra-ingestion/0.1.0",
          accept: "application/json, application/octet-stream, */*",
        },
      });
    } catch (err: unknown) {
      if (signal.aborted) {
        throw new IngestionError("NETWORK_TIMEOUT", "Fetch request timed out or was aborted", true);
      }
      throw new IngestionError(
        "NETWORK_ERROR",
        `Network error fetching "${currentUrl}": ${(err as Error).message}`,
        true,
      );
    }

    // Check for redirects (301, 302, 303, 307, 308)
    if (res.status >= 300 && res.status < 400) {
      hops++;
      if (hops > INGESTION_LIMITS.MAX_REDIRECTS) {
        throw new IngestionError(
          "HTTP_ERROR",
          `Exceeded maximum redirect limit of ${INGESTION_LIMITS.MAX_REDIRECTS} hops`,
          false,
        );
      }

      const location = res.headers.get("location");
      if (!location) {
        throw new IngestionError(
          "HTTP_ERROR",
          `Redirect status ${res.status} missing Location header`,
          false,
        );
      }

      // Resolve relative redirect against current URL
      const nextUrl = new URL(location, currentUrl).toString();
      validateUrl(nextUrl);
      currentUrl = nextUrl;
      continue;
    }

    if (res.status === 404) {
      throw new IngestionError("NOT_FOUND", `Resource not found (404): ${currentUrl}`, false);
    }

    if (!res.ok) {
      throw new IngestionError(
        "HTTP_ERROR",
        `HTTP error ${res.status} ${res.statusText} from ${currentUrl}`,
        res.status >= 500,
      );
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new IngestionError("INVALID_ARCHIVE", `Response body is null: ${currentUrl}`);
    }

    const chunks: Buffer[] = [];
    let bytesRead = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          bytesRead += value.length;
          if (bytesRead > maxBytes) {
            throw new IngestionError(
              "ARCHIVE_LIMIT_EXCEEDED",
              `Downloaded payload from ${currentUrl} exceeded size limit of ${maxBytes} bytes: ${bytesRead}`,
            );
          }
          chunks.push(Buffer.from(value));
        }
      }
    } finally {
      reader.releaseLock();
    }

    return {
      buffer: Buffer.concat(chunks),
      url: currentUrl,
    };
  }
}

/**
 * Verifies that a buffer matches an SRI string.
 * Currently supports sha512-<base64> (standard for npm registry releases).
 */
export function verifySriIntegrity(buffer: Buffer, sri: string): void {
  const parts = sri.trim().split(/\s+/);
  let matched = false;

  for (const part of parts) {
    if (part.startsWith("sha512-")) {
      const expectedBase64 = part.slice(7);
      const computedBase64 = createHash("sha512").update(buffer).digest("base64");
      if (computedBase64 !== expectedBase64) {
        throw new IngestionError(
          "INTEGRITY_MISMATCH",
          `sha512 integrity mismatch: expected "${expectedBase64}", got "${computedBase64}"`,
        );
      }
      matched = true;
      break;
    }
  }

  if (!matched) {
    throw new IngestionError(
      "INTEGRITY_MISMATCH",
      `No supported sha512 integrity found in SRI specifier: "${sri}"`,
    );
  }
}

export interface FetchNpmArtifactOptions {
  fetch?: typeof fetch;
}

export async function fetchNpmArtifact(
  input: Extract<AnalysisRequest["artifact"], { kind: "npm" }>,
  context: AdapterContext,
  options?: FetchNpmArtifactOptions,
): Promise<ArtifactSnapshot> {
  // 1. Strict input validation (exact version and valid package name)
  if (!NPM_NAME_REGEX.test(input.name)) {
    throw new IngestionError("INVALID_INPUT", `Invalid npm package name: "${input.name}"`);
  }

  if (!EXACT_VERSION_REGEX.test(input.version)) {
    throw new IngestionError(
      "INVALID_INPUT",
      `Version must be an exact semver version (no ranges, tags, or wildcards): "${input.version}"`,
    );
  }

  const effectiveFetch = options?.fetch ?? globalThis.fetch;
  if (typeof effectiveFetch !== "function") {
    throw new IngestionError("NETWORK_ERROR", "Global fetch is not available");
  }

  // 2. Setup 30s timeout signal combined with context.signal
  const timeoutController = new AbortController();
  const timeoutTimer = setTimeout(() => {
    timeoutController.abort(
      new IngestionError("NETWORK_TIMEOUT", "Network request exceeded 30-second timeout", true),
    );
  }, INGESTION_LIMITS.NETWORK_TIMEOUT_MS);

  const combinedSignal = AbortSignal.any([context.signal, timeoutController.signal]);

  try {
    // 3. Fetch registry metadata
    const encodedName = encodePackageName(input.name);
    const metadataUrl = `https://registry.npmjs.org/${encodedName}/${input.version}`;

    const { buffer: metaBuf } = await safeFetch(
      metadataUrl,
      effectiveFetch,
      combinedSignal,
      5 * 1024 * 1024,
    );

    let doc: any;
    try {
      doc = JSON.parse(metaBuf.toString("utf8"));
    } catch {
      throw new IngestionError("INVALID_INPUT", "Registry response is not valid JSON");
    }

    const dist = doc?.dist;
    const tarballUrl = dist?.tarball;
    const integrity = dist?.integrity;

    if (!tarballUrl || typeof tarballUrl !== "string") {
      throw new IngestionError(
        "NOT_FOUND",
        `Registry metadata does not contain a tarball URL for ${input.name}@${input.version}`,
      );
    }

    // Require dist.integrity (strictly reject if missing)
    if (!integrity || typeof integrity !== "string") {
      throw new IngestionError(
        "INTEGRITY_MISMATCH",
        `Registry release for ${input.name}@${input.version} is missing dist.integrity`,
      );
    }

    // 4. Stream tarball download (capped at MAX_COMPRESSED_BYTES)
    const { buffer: tarballBuffer } = await safeFetch(
      tarballUrl,
      effectiveFetch,
      combinedSignal,
      INGESTION_LIMITS.MAX_COMPRESSED_BYTES,
    );

    // 5. Verify SRI integrity
    verifySriIntegrity(tarballBuffer, integrity);

    // 6. Parse tarball in-memory
    const stream = Readable.from(tarballBuffer);
    const files = await parseTarGzStream(stream, {
      maxEntries: context.limits.maxEntries,
      signal: combinedSignal,
    });

    // 7. Verify package.json inside archive matches requested name and version
    const manifestBuf = files.get("package/package.json") ?? files.get("package.json");
    if (!manifestBuf) {
      throw new IngestionError(
        "INVALID_ARCHIVE",
        "Archive does not contain a package.json manifest",
      );
    }

    let manifest: any;
    try {
      manifest = JSON.parse(manifestBuf.toString("utf8"));
    } catch {
      throw new IngestionError(
        "INVALID_ARCHIVE",
        "Archive package.json is not valid JSON",
      );
    }

    if (manifest.name !== input.name || manifest.version !== input.version) {
      throw new IngestionError(
        "INTEGRITY_MISMATCH",
        `Archive manifest identity (${manifest.name}@${manifest.version}) does not match request (${input.name}@${input.version})`,
      );
    }

    // 8. Populate metadata from registry release object and package manifest
    const metadata: PackageMetadata = {
      name: input.name,
      version: input.version,
    };

    if (typeof doc.gitHead === "string") {
      metadata.gitHead = doc.gitHead;
    } else if (typeof manifest.gitHead === "string") {
      metadata.gitHead = manifest.gitHead;
    }

    const repo = doc.repository ?? manifest.repository;
    if (typeof repo === "string") {
      metadata.repository = { url: repo };
    } else if (typeof repo === "object" && repo !== null && typeof repo.url === "string") {
      metadata.repository = {
        url: repo.url,
        ...(typeof repo.directory === "string" ? { directory: repo.directory } : {}),
      };
    }

    const root = files.has("package/package.json") ? "package" : "";
    return buildArtifactSnapshot(files, metadata, root || "package");
  } finally {
    clearTimeout(timeoutTimer);
  }
}

