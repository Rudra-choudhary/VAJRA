# Vajra shared contracts

Run `npm ci --ignore-scripts && npm run build` from the repository root. Import schemas and types from `@vajra/contracts`; do not copy types into your module. Zod schemas in `src/index.ts` are the source of truth. Only Rudra edits this package.

## For frontend owner C

`fixtures/clean.json`, `suspicious.json`, `partial.json`, and `failed.json` contain synthetic development fixtures. Each has a `job` matching the API; successful/partial fixtures also have `details` for the file-detail endpoint. They are explicitly labeled as fixtures and their model is not real. Never present them as a live assessment.

Validate incoming jobs with `AnalysisJobSchema` and details with `FileDetailSchema`. A partial job is terminal but retains useful findings. Confidence and severity are separate. A completed analysis is not a safety verdict. Local paths must not appear in browser requests or responses. Source archive identity is represented by snapshot SHA-256; a Git commit may be absent.

## For retrieval owner B

Implement `IngestionAdapter` from `src/adapters.ts`. It includes the optional `resolveGithubRef` method needed for tag fallback. Return full immutable commits, never `main` or a mutable tag from `fetchGithubSnapshot`. The engine determines which source to use. `root` on artifact snapshots is the archive wrapper (usually `package`), not a monorepo directory. Paths are POSIX, archive-root-relative. Only regular files are entries. Source archives preserve repository paths; the engine selects their package root.

Use ingestion-local constants for IO limits; these are intentionally separate from engine `Limits` because their enforcement happens before a snapshot exists. Initial limits: 25 MiB compressed input/download, 100 MiB expanded archive bytes, 10,000 entries, 5 MiB per entry, nesting depth 32, 512 KiB text preview, 30-second network timeout, and at most 3 redirects. Enforce streaming byte limits and validate every redirect destination against the HTTPS host allowlist. Use the published `IngestionErrorCode` union for typed adapter errors: `INVALID_INPUT`, `UNSUPPORTED_HOST`, `NETWORK_ERROR`, `NETWORK_TIMEOUT`, `HTTP_ERROR`, `REGISTRY_ERROR`, `NOT_FOUND`, `INTEGRITY_MISMATCH`, `INVALID_ARCHIVE`, `UNSAFE_ARCHIVE_ENTRY`, `ARCHIVE_LIMIT_EXCEEDED`, `UPLOAD_NOT_FOUND`, and `CANCELLED`. Node's built-in `fetch` is the approved HTTP client; `tar` is already pinned for archive handling. Request any additional dependency from A.

`sha256` on snapshots identifies the archive; per-entry SHA-256 identifies original bytes. `readText` must enforce its byte cap and flag truncation/binary content. Full untruncated UTF-8 text is checked against its entry hash. Unsupported encoding should return unavailable/truncated content, not a lossy successful decode. Resolve upload IDs through context, never directly from untrusted client paths. Context is read-only and includes cancellation and shared text limits; compressed/expanded archive limits remain your responsibility.

Metadata `name`, `version`, `repository` and `gitHead` comes from the exact registry release or artifact manifest. Registry integrity verification is your responsibility and is not equivalent to source provenance verification.

## For service owner D

Use `analyze(request, dependencies, onProgress)` from `@vajra/engine`. Supply an analysis ID, ingestion adapter, workspace directory, upload resolver and `saveFileDetail` callback. The engine returns an already validated report. Persist that report and the terminal job status together. A thrown error means failed analysis; do not turn it into a clean report. Delete partial file-detail writes after persistence failures.

Cancellation propagates; model timeout alone preserves deterministic results in a partial report. `saveFileDetail` must persist content under analysis ID and file ID without exposing filesystem paths. Set `model` using `createOllamaClient`; missing models deliberately produce partial results. The engine does not call a cloud fallback.

Schema fields and HTTP routes are in `VAJRA_TEAM_PRD.md`. Before editing shared contracts or dependency manifests, coordinate with Rudra. Additional adapter types are exported through the same package.
