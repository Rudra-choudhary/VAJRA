# Vajra product requirements and team execution guide

Version 1.1 | Problem 04 | Four members | Ten-hour implementation budget

Repository: https://github.com/Rudra-choudhary/VAJRA

Clone URL: `https://github.com/Rudra-choudhary/VAJRA.git`

Team members: Ayush Aryan, Aparna Singh, Rudra Pratap Singh Choudhary, and Neeraj Singh. Team name: VAJRA. Rudra owns Assignment A; assignments B/C/D remain to be allocated among the other three members based on their strengths.

Foundation implementation is on branch `codex/engine`. Executable contracts now live in `packages/contracts/src/index.ts` and `packages/contracts/src/adapters.ts`; these take precedence over illustrative signatures below. Shared development fixtures are in `packages/contracts/fixtures/`. Read `packages/contracts/README.md` before implementing adapters or HTTP handlers.

This is the single handoff document for the team. It defines what to build, who owns each part, the interfaces between parts, the Git workflow, and the submission checks. Share this whole file with every member and their coding assistant. This document supersedes the earlier roadmap where assignments or interfaces differ.

**Decision:** Build a complete npm package integrity review application. Rudra owns the hardest analysis, source-resolution, AI, and integration decisions. The other three members own bounded retrieval, frontend, and application-service work. Target full integration by hour 6 and use hours 7–10 for evaluation and release quality.

**Timing:** Ten hours is an elapsed effort plan, not an extension of the event deadline. The supplied event document states that the repository link must be submitted by 8:30 PM IST on 31 October 2026. Confirm the remaining implementation/submission window before starting. Submit the repository link on time even if development continues under organizer rules.

## 1 Product definition

### Problem and users

Maintainers and developers review source repositories but install published artifacts. Differences can arise from normal packaging, compilation, or unauthorized modifications. Vajra makes those differences inspectable and explains the evidence without assuming every mismatch is malicious.

Primary users are maintainers reviewing releases and developers investigating a dependency. Judges must also be able to compare a local tampered archive against a known source snapshot.

### Main user journey

1. Enter an npm package and exact version, or upload an npm archive.
2. Select automatic source resolution or supply a GitHub repository and exact commit. Local source archives are accepted for offline demonstrations.
3. Watch retrieval, resolution, comparison, and assessment progress.
4. Review source identity, coverage, findings, and unresolved differences.
5. Open a file and see package/source evidence beside the explanation.
6. Export JSON or Markdown; optionally watch an npm package for future releases.

### Success criteria

- A real npm release and a modified copy can both be analyzed through UI and CLI.
- Each finding links to existing evidence; speculative explanations are labeled.
- Unknown source identity, incomplete analysis, and AI failure are visible.
- Routine packaging differences do not automatically become high-severity findings.
- A fresh checkout installs and runs using documented commands.
- CI passes, monitoring detects a new fixture release, and actual reports are included in examples.
- Evaluation records sample counts, detection results, false positives, unresolved cases, and timing. No accuracy claims are made before measurement.

### Scope boundaries

Support npm first; GitHub is the initial remote source host. Local source archives provide an escape hatch for unsupported repositories. Support plain JavaScript, package manifests, readable TypeScript, and inspection of generated outputs. Generated outputs need not be proven equivalent.

Do not add PyPI, arbitrary build execution, accounts, billing, multi-tenant deployment, automatic fix PRs, or a malware-free certification. Do not automatically post issues/comments to external repositories. Local application plus CLI is the delivery target; a public hosted demo is optional only after the release gate.

## 2 Product requirements and acceptance

| ID | Requirement | Acceptance check | Owner |
| --- | --- | --- | --- |
| P01 | Retrieve exact npm releases | Inventory records exact version, digest, and retrieval evidence; scoped names work | B |
| P02 | Inspect local package/source archives safely | Valid inputs work; traversal, links, excessive entries/sizes are rejected | B |
| P03 | Resolve source revision and package root | Report includes exact commit and resolution method; ambiguous mapping stays unresolved or requires override | A |
| P04 | Compare artifacts | Added, removed, changed, identical, binary, and skipped files are represented with raw hashes | A |
| P05 | Explain differences | Packaging claims cite configuration; generated-output identity is not asserted without proof | A |
| P06 | Detect suspicious changes | Controlled lifecycle-script and code-injection fixtures produce evidence-backed review findings | A |
| P07 | Use an open-weight model meaningfully | Model contextualizes differences and returns validated explanations; model identity/failure is recorded | A |
| P08 | Provide a finished review UI | Input, progress, report, file diff, export, history and watchlist work with real API data | C |
| P09 | Provide CLI and reports | CLI and UI consume the same engine; JSON and Markdown include input identity and coverage | D |
| P10 | Monitor releases | Scheduled invocation identifies an unseen version/digest, stores its report, and does not duplicate completed analyses | D |
| P11 | Handle errors honestly | Invalid input, network failure, unresolved source, limits, and model failure have distinct visible outcomes | All |
| P12 | Meet submission requirements | Required repository files, actual examples, PR history and successful CI are present | D coordinates |

### Finding and coverage rules

Severity describes potential impact. Confidence describes evidence strength. Keep them separate. A published-only file or network call alone is not proof of an attack. The tool must distinguish observed behavior from a security interpretation.

Use these classifications: `exact_match`, `explained_packaging`, `generated_unverified`, `suspicious_change`, and `unresolved`. Source mismatch or uncertain resolution must propagate into dependent findings. A complete report may still contain unresolved differences; a partial report must explain which analysis stages were skipped or failed. Never display a global “safe” verdict.

## 3 Architecture and ownership

Use one npm-workspace TypeScript repository. Proposed libraries: React/Vite for UI, Fastify for HTTP, Zod for shared schemas, Vitest for tests, and SQLite for local persistence. Rudra pins exact versions after checking compatibility during setup. Do not independently upgrade libraries or introduce a second framework.

| Member | Role | Exclusive write ownership | Complexity |
| --- | --- | --- | --- |
| A — Rudra | Technical lead and analysis owner | `packages/contracts/`, `packages/engine/`, root manifests/configuration and this PRD | Hardest: source identity, mapping, detection, AI, evidence validation, final architectural decisions |
| B — teammate 2 | Retrieval and archive adapter | `packages/ingestion/`, `tests/fixtures/ingestion/` | Bounded IO work with explicit safety requirements; escalate uncertain archive handling to A |
| C — teammate 3 | Frontend | `apps/web/` except its dependency manifest | UI built against fixed contracts and fixtures |
| D — teammate 4 | Service and delivery | `apps/server/`, `apps/cli/`, `packages/storage/`, `packages/reports/`, `.github/`, `docs/`, `examples/`, `tests/e2e/`, `README.md` | API/storage/CLI integration using the provided engine interface |

Each owner writes colocated unit tests. A owns shared fixtures under `packages/contracts/fixtures/` and evaluation fixtures under `tests/fixtures/evaluation/`. D owns license and event metadata after the initial commit, with team review. Actual teammate names are assigned at kickoff; use B/C/D labels until then.

A alone updates **every package.json**, root lockfile, TypeScript base configuration, root scripts, and shared contracts. B/C/D request dependencies by name and purpose instead of editing manifests. D owns CI but coordinates script names with A. Ownership applies to coding assistants too.

### Data flow

`UI or CLI → service/orchestrator → ingestion → source resolver → comparison → rules and AI → validated report → storage/export/UI`

B handles low-level retrieval and archive validation. A handles source-selection policy and package-root mapping, using B's retrieval functions. D handles job state and orchestration through A's one public engine entry point. C consumes HTTP responses, never engine internals or filesystem paths.

## 4 Shared contracts

A must turn this section into executable Zod schemas and TypeScript exports before parallel implementation. The executable schema is authoritative after setup. Request a coordinated schema change rather than inventing additional fields locally. Use schema version `1`.

### Public data model

```ts
type Stage = 'queued' | 'retrieving' | 'resolving' | 'comparing' | 'assessing' | 'done';
type JobStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed';
type Confidence = 'high' | 'medium' | 'low';
type Severity = 'info' | 'low' | 'medium' | 'high';
type Classification = 'exact_match' | 'explained_packaging'
  | 'generated_unverified' | 'suspicious_change' | 'unresolved';

type ArtifactInput =
  | { kind: 'npm'; name: string; version: string }
  | { kind: 'upload'; uploadId: string };
type SourceInput =
  | { kind: 'auto' }
  | { kind: 'github'; repositoryUrl: string; commit: string; packageRoot?: string }
  | { kind: 'upload'; uploadId: string; packageRoot?: string };
interface AnalysisRequest { artifact: ArtifactInput; source: SourceInput }
interface EvidenceRef {
  fileId: string; side: 'package' | 'source';
  startLine?: number; endLine?: number; excerpt?: string;
}
interface Finding {
  id: string; ruleId: string; title: string;
  classification: Classification; severity: Severity; confidence: Confidence;
  explanation: string; evidence: EvidenceRef[];
  origin: 'rule' | 'model' | 'combined'; limitations: string[];
}
interface FileSummary {
  id: string; packagePath?: string; sourcePath?: string;
  status: 'identical' | 'added' | 'removed' | 'modified' | 'skipped';
  packageHash?: string; sourceHash?: string;
  binary: boolean; truncated: boolean; findingIds: string[];
}
interface AnalysisReport {
  schemaVersion: 1; id: string; status: 'completed' | 'partial';
  createdAt: string; request: AnalysisRequest;
  artifact: { name?: string; version?: string; sha256: string };
  source: {
    repositoryUrl?: string; commit?: string; snapshotSha256?: string;
    packageRoot?: string; method: string;
    confidence: Confidence; evidence: string[]; limitations: string[];
  };
  coverage: {
    totalFiles: number; comparedFiles: number; skippedFiles: number;
    reasons: string[];
  };
  files: FileSummary[]; findings: Finding[];
  model: { id: string | null; status: 'used' | 'failed' | 'not_configured'; reason?: string };
  toolVersion: string; rulesVersion: string; durationMs: number;
}
interface ApiError {
  code: string; message: string; retryable: boolean;
}
interface AnalysisJob {
  id: string; status: JobStatus; stage: Stage;
  report?: AnalysisReport; error?: ApiError;
}
```

Use UTC ISO strings for stored timestamps; render in the user's locale. Line numbers are one-based and inclusive. Evidence IDs must resolve inside that analysis. Do not expose server filesystem paths. `completed` does not mean safe. An unresolved source normally produces a partial report, preserving whatever artifact-level checks ran.

### Internal module boundaries

A publishes exact types in hour 1. These signatures establish responsibility; implementations must match the published types:

```ts
// B: bounded operations only, no AI or risk classification
fetchNpmArtifact(input, context): Promise<ArtifactSnapshot>
fetchGithubSnapshot(input, context): Promise<SourceSnapshot>
inspectUploadedArchive(input, context): Promise<ValidatedSnapshot>

// A: public engine boundary used by D
analyze(request, dependencies, onProgress): Promise<AnalysisReport>

// D: report and persistence operations
saveReport(report): Promise<void>
getReport(id): Promise<AnalysisReport | null>
renderMarkdown(report): string
```

Snapshot entries contain logical path, type, byte count and raw SHA-256, plus bounded content access kept internal. Snapshots record identity and archive digest. Context carries cancellation, workspace location, limits, and a logger that redacts secrets. Dependencies include ingestion, model client, upload resolver, analysis ID, and file-detail persistence. A's engine owns pipeline ordering; D must not reimplement it.

### HTTP contract owned by D

| Method and route | Request | Response |
| --- | --- | --- |
| POST `/api/uploads` | Multipart field `file`, field `purpose` = `package` or `source` | 201 `{uploadId, filename, sizeBytes}` |
| POST `/api/analyses` | `AnalysisRequest` | 202 `{id, status: 'queued'}` |
| GET `/api/analyses/:id` | None | 200 `AnalysisJob` |
| GET `/api/analyses` | Optional bounded `limit` and `cursor` | 200 `{items: AnalysisSummary[], nextCursor: string|null}` |
| GET `/api/analyses/:id/files/:fileId` | None | 200 `{file, packageText, sourceText, unifiedDiff, truncated}`; unavailable text is null |
| GET `/api/analyses/:id/export` | Query `format=json` or `markdown` | Download with correct content type and filename |
| GET `/api/watchlist` | None | 200 `{items: WatchEntry[]}` |
| POST `/api/watchlist` | `{name}` npm name | 201 `WatchEntry`; existing entry returned with 200 |
| DELETE `/api/watchlist/:id` | None | 204 |
| GET `/api/health` | None | 200 `{status:'ok'}` |

`AnalysisSummary` contains id, name/version when known, status, createdAt and findingCount. `WatchEntry` contains id, name, lastCheckedAt, lastVersion, lastDigest, lastAnalysisId and lastError; values not yet known are null. A adds these schemas during setup.

Errors use `{error: ApiError}` with 400 invalid request, 404 missing object, 413 size limit, 429 capacity limit and 500 unexpected failure. Running jobs return their stage, not fake percentage progress. UI polls every two seconds and stops on terminal status; transient failures use bounded backoff. Deleting a watch entry does not delete reports.

## 5 Assignment A for Rudra

**Mission:** Deliver the trustworthy analysis engine and protect the shared architecture. This is the most difficult workstream; delegate UI, persistence, ordinary routing, and documentation tasks to preserve focus.

1. Establish root scripts, workspace structure, executable contracts, development fixtures and public engine interface in the foundation PR.
2. Verify an actual open-weight model call early; configure credentials outside Git. Choose the model and record its exact identity and reason in event metadata.
3. Resolve source using release metadata, candidate tags and explicit overrides. Verify candidate existence. Tag naming alone is weak evidence; record ambiguity. Never silently compare to the latest default branch.
4. Resolve monorepo roots and map artifact paths to source paths. Preserve raw hash comparisons separately from any normalization.
5. Produce line-accurate diffs, packaging-rule evidence, generated-output limitations and coverage data.
6. Implement review signals for lifecycle changes, published-only executable code, introduced network/execution behavior, sensitive data access and unexplained source modifications. Require context before escalating severity.
7. Give the model bounded diffs and relevant manifest/configuration evidence. Treat all content as untrusted data. Validate schema and every evidence reference; reject fabricated locations.
8. Finalize reports through one validation layer. Continue deterministic checks if the model fails, but label analysis partial where required.
9. Own evaluation corrections and final technical merge decisions. Ask B to help on archive/source bugs and D to own routine integration fixes.

**Done:** real inputs reach validated reports; ambiguous cases remain honest; generated outputs are not declared safe; planted changes can be traced to exact evidence; tests cover matching, references, model failure and unsupported cases.

## 6 Assignment B for retrieval and archive handling

**Mission:** Convert approved inputs into bounded, reproducible snapshots. Do not decide whether a package is malicious or select a source revision independently.

1. Implement exact-version npm metadata retrieval including scoped package names, archive URL and integrity metadata. Verify registry-provided integrity where available and compute SHA-256 regardless.
2. Fetch GitHub snapshots for an exact commit supplied by A. Preserve repository and commit identity.
3. Accept upload handles through the injected resolver. Never accept an arbitrary filesystem path from HTTP input.
4. Use maintained archive libraries approved by A. Reject traversal, absolute paths, links, duplicate/colliding paths and entries that exceed limits. Do not write outside the analysis workspace or execute contents.
5. Produce inventories with raw hashes and bounded content reading. Mark binary or oversized text explicitly rather than silently omitting it.
6. Enforce initial configurable limits: 25 MB compressed input, 100 MB total expanded data, 10,000 entries, 5 MB per entry, 512 KB text preview and 30-second network request timeout. Enforce streaming limits, not only advertised lengths. A can adjust after representative testing.
7. Restrict remote fetches to supported HTTPS hosts and validate redirect destinations. Coordinate host allowlists and local/private-address protection with A; do not invent a generic URL downloader.
8. Clean up temporary files on success, cancellation and failure. Return typed errors, never process exits.

**Tests:** valid package; scoped package; malformed archive; path traversal; unsafe link; size/entry limit; registry error; timeout; digest mismatch; binary file.

**Done:** deterministic snapshots from real and uploaded archives, passing safety tests and documented errors. Escalate uncertain archive behavior instead of weakening a check to make a fixture pass.

## 7 Assignment C for frontend

**Mission:** Deliver a finished review experience using the shared API. Begin with contract fixtures; replace the transport with real API calls at the hour-3 integration checkpoint.

1. Build input modes for npm and archive upload, plus automatic/explicit source selection. Validate required fields and disable duplicate submissions.
2. Build progress view with stage names and recoverable errors. Never display invented progress or security scores.
3. Build report overview with artifact digest, source commit/method, confidence, model status, coverage and unresolved items.
4. Build searchable file list and evidence review panel. Show source/package paths, line numbers, diff, finding severity/confidence and limitations.
5. Add report downloads, history, watchlist create/delete and empty/loading/error states.
6. Use restrained developer-tool styling, readable monospace code, keyboard navigation, visible focus and severity labels that do not rely only on color.
7. Render repository text and model explanations as escaped text. If Markdown is rendered, sanitize it and disable raw HTML. Do not leak API keys to the browser.
8. Keep API client and mock transport separate. Demonstration data must be labeled as fixtures and never appear as a completed real analysis.

**Tests:** form errors, running-to-completed transition, partial report visibility, failed request, finding selection and export action. D covers full browser-to-engine integration.

**Done:** full flow works against real API; no hardcoded report counts; missing evidence cannot crash the page; all major states are usable.

## 8 Assignment D for service and delivery

**Mission:** Connect the agreed modules without recreating analysis logic. Keep a working end-to-end application, CLI and release workflow.

1. Implement API routes from section 4 and validate all requests/responses using shared schemas.
2. Use an in-process queue with one analysis at a time initially. Persist job state and reports in SQLite. On restart, mark interrupted jobs failed/retryable rather than leaving them running forever.
3. Store file details behind analysis/file IDs, serve bounded previews, and reject access to another analysis's files.
4. Bind the local server to loopback by default. Keep remote exposure out of scope. Coordinate local-origin/request protections with A.
5. Implement CLI commands: `analyze`, `watch add`, `watch list`, `watch remove`, and `monitor --once`. CLI local paths are resolved locally into the same validated input pipeline.
6. CLI exit codes: 0 complete and below configured severity threshold; 1 complete with findings at/above threshold; 2 invalid input, partial or failed analysis. Default threshold is high. Document the distinction between security findings and operational failure.
7. Implement report exports and watch state. Retry failed analyses on a later monitor run; only mark a release successfully analyzed after persistence succeeds.
8. Provide GitHub Actions monitoring example with persistent state via an explicitly configured mechanism, such as a saved cache keyed per run with restore prefixes. Account for cache loss: report deduplication must remain digest-based and a missing cache may cause safe reanalysis. Do not claim the ephemeral runner's local SQLite survives by itself.
9. Implement CI, end-to-end fixtures, README, actual examples and clean-install instructions. Each teammate supplies their own module notes.

**Done:** UI and CLI invoke the same engine; jobs survive as explicit records; exports work; monitor detects a new controlled release; fresh installation and CI pass.

## 9 Git workflow and conflict prevention

### One-time setup by A

The current planning files are not the first hackathon commit. Verify repository history before initializing or committing anything. If a new event repository is required, create it separately rather than deleting an existing history.

The first commit must contain only `HACKATHON.md`. Add only that file explicitly; never run `git add .` for this commit. It must name the team, members, selected problem, AI models and reasons. After that, A creates a foundation PR with contracts, skeletons, approved manifests, fixtures, CI baseline and this PRD. All members branch from main **after that PR is merged**.

If available, configure main-branch protection with required CI and one review, and disable force pushes. D may prepare settings; A applies them. CODEOWNERS should route ownership, but it does not itself prevent edits unless supported protections are enabled.

### Branch ownership

- A: `codex/engine`
- B: `codex/ingestion`
- C: `codex/ui`
- D: `codex/service`

Each person uses their own clone or separate Git worktree. Never have multiple assistants switch branches inside the same working directory. Never commit on another member's branch. Feature branches may contain ordinary commits; every change reaches main through a PR.

### Daily procedure for each member

Run the following after the foundation PR is merged, replacing the branch example with your assigned branch:

```sh
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c codex/ingestion
```

Before committing, inspect both working and staged changes. Stage only owned paths:

```sh
git status --short
git diff
git add packages/ingestion tests/fixtures/ingestion
git diff --cached --stat
git diff --cached
# Run the agreed module checks, then commit and push your branch.
git commit -m "Add bounded npm artifact ingestion"
git push -u origin codex/ingestion
```

Before updating a PR, start from a clean working tree, fetch and merge current main into your feature branch. This avoids rewriting a published branch:

```sh
git fetch origin
git merge origin/main
# Resolve conflicts with the affected owner, rerun checks, then push.
git push
```

Never use force push, `reset --hard`, blanket conflict resolution using ours/theirs, or overwrite another owner's files to get a green build. If a conflict involves contracts or lockfiles, stop that merge resolution and ask A to coordinate it. Do not discard local changes to make the command succeed.

### PR and merge rules

- Keep PRs focused and reviewable; one module change per PR when possible.
- Every PR states behavior, product model usage, coding assistants used, tests, and any contract changes.
- B and D review each other's IO/service work. C reviews UI behavior with D. A reviews source/security/evidence changes; another member reviews A's PR against fixtures and acceptance checks.
- A is the final merge coordinator; review preparation is distributed. Merge only after required checks pass on an up-to-date branch.
- Merge order: foundation → ingestion/interface increments → engine increments → service wiring → UI integration. Fixture-based UI and service work can merge earlier if it does not claim unsupported live functionality.
- Use ordinary merge commits for team feature PRs during this event to preserve branch ancestry. After a finished branch is deleted, create the next branch from updated main.
- Shared-schema changes are coordinated by A and include updated fixtures, consumer migrations and tests before integration.
- Generated outputs belong only in designated examples; node_modules, databases, secrets, archives downloaded for experiments and model weights are ignored.

These controls reduce textual conflicts. They cannot guarantee semantic compatibility; schema validation and integration tests are required even when Git merges cleanly.

## 10 Ten-hour parallel schedule

| Time | A Rudra | B Retrieval | C Frontend | D Service | Gate |
| --- | --- | --- | --- | --- | --- |
| 0–0.5h | Foundation contracts and model decision | Read IO contract and fixtures | Read API and sketch screens | Prepare CI/service skeleton | Initial commit rule met; foundation agreed |
| 0.5–2h | Model connectivity, source policy, comparison on fixtures | npm/archive adapter and limits | Input/progress/report on fixtures | API/queue/storage/CLI skeleton | Modules work independently |
| 2–3h | Wire source resolver and real comparison | Exact Git snapshot retrieval | Connect real API | Wire engine to API/CLI | First real analysis visible |
| 3–4.5h | Rules, AI explanations, evidence validation | Monorepo snapshot support and error tests | Diff/evidence review and uploads | Exports, history and monitoring | Legitimate and modified artifacts inspectable |
| 4.5–6h | Coverage and false-positive fixes | Security tests and IO fixes | Watchlist and all UI states | Scheduled monitor and end-to-end checks | Feature freeze; complete workflow |
| 6–8h | Held-out evaluation and analysis fixes | Resolution/archive evaluation | Real-data UX verification | Metrics and regression runs | Measured results; critical defects fixed |
| 8–9h | Final engine documentation/review | Clean-install support and IO notes | Demo preparation and UI fixes | Final CI and release documentation | Reproducible candidate |
| 9–10h | Technical demo rehearsal | Explain input/source pipeline | Lead UI demonstration | Submission and CI checks | Shared understanding and submission |

Do a ten-minute integration check near hours 2, 3, 4.5 and 6. Escalate blockers after 15 minutes. Keep working against the agreed fixtures while a dependency is repaired. Additional capacity goes to reliability, not extra ecosystems.

## 11 Testing and release checklist

### Evaluation design

Select 6–10 manageable real npm releases early, covering ordinary source packaging, transpilation, bundling and a monorepo. They are controls for packaging noise, not certified benign software. Record why each alert on a control is considered correct, incorrect or unresolved.

Create modified copies with lifecycle-script injection, outbound-request injection, unexpected executable content and source modification. Add harmless packaging changes and source-ambiguity cases. Keep development fixtures separate from held-out evaluation inputs; do not retune every rule on the held-out set and still call it independent evaluation.

Record planted-change detection rate, false-positive findings, source-resolution success, unresolved count, model failures and runtime. Never invent target achievement or claim general malware accuracy from this small set.

### Required gates

- [ ] All shared schemas validate actual reports and API examples.
- [ ] Archive boundaries, request limits and safe temporary paths are tested.
- [ ] Unknown source and generated output cases remain explicit.
- [ ] AI output references exist; malicious repository text cannot become instructions.
- [ ] Model failure produces an honest partial result.
- [ ] UI and CLI return equivalent evidence for the same pinned inputs.
- [ ] Watch monitoring detects a controlled new release and retries failures correctly.
- [ ] Fresh checkout installation succeeds without developer-local state.
- [ ] Every member's unit tests and D's integration checks pass.
- [ ] Examples contain actual inputs/output with identities and provenance notes.
- [ ] README documents supported scope, model setup, commands, limits and known gaps.
- [ ] Public repo, MIT/Apache-2.0 license, required template, HACKATHON.md and CI exist.
- [ ] Initial commit and subsequent PR workflow comply with event rules.
- [ ] Final submitted commit passes CI and repository link is submitted on time.

### Demo sequence

Analyze a real release, explain an expected difference, then analyze its controlled modified copy and inspect injected behavior. Show an unresolved example, export a report and demonstrate monitoring with a controlled release fixture. Finish with measured results and limitations. Each member explains their module; all four must understand the full pipeline.

## 12 Instructions to give each coding assistant

Paste this entire document, then append the relevant instruction below. The assistant must first inspect repository instructions and executable contracts. It must not start a second project or replace existing implementation indiscriminately.

**For A Rudra:** “Implement Assignment A. Own shared contracts and the hardest source-resolution, comparison, security-analysis and AI work. Preserve B/C/D boundaries. Establish a small working pipeline early. Validate evidence and uncertainty rather than fabricating security conclusions. Coordinate shared-file changes and integration.”

**For B:** “Implement Assignment B only. Edit only your assigned paths. Consume shared types; do not change dependencies, contracts, UI or service. Build bounded retrieval and archive inspection using approved libraries. Test failure cases. If the contract or dependency is insufficient, report the exact change needed to Rudra rather than inventing a new interface.”

**For C:** “Implement Assignment C only. Edit apps/web except manifests. Use shared contract fixtures first, then the agreed API. Do not invent endpoints, counts or security scores. Include error, partial and empty states. Request dependency or contract changes from Rudra. Keep mocks separate from live results.”

**For D:** “Implement Assignment D only. Consume the public analyze interface; do not write a second analysis engine. Implement the agreed API, queue, storage, CLI, exports, monitoring and integration checks. Do not change shared manifests/contracts. Coordinate with Rudra on scripts and schema changes. Follow the PR-only workflow.”

## 13 Source and assumptions

Event requirements are taken from the supplied HACKTOBERFEST 2026 PDF, particularly Problem 04 and sections 4–6. Architecture, interfaces, assignments, limits and timings in this PRD are team implementation decisions, not organizer mandates. Exact teammate names, model/runtime, dependency versions and available clock time must be recorded at kickoff. This document does not claim implementation, testing or repository protection has already occurred.
