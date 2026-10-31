# Vajra: 10-hour delivery roadmap

Selected problem: **04 — Published Package vs Source Code Integrity Analyzer**.

Status: planning only. This document is not an implementation or a claim of completed validation.

## Product and scope

Vajra compares an npm release archive with its corresponding source revision, explains packaging differences, and highlights suspicious changes with inspectable evidence.

The finished workflow is: select package/version → resolve source → compare files → inspect findings → export report → optionally monitor future releases.

We will ship one complete ecosystem integration: npm. Local archive input is equally important because organizers may supply tampered copies. Source directories or explicit source revisions must also be accepted so evaluation does not depend on automatic release matching.

The output is an integrity assessment, not a certificate that a package is safe. A clean comparison means no differences were found within the stated coverage; it does not establish that the source itself is benign.

### Required delivery

- npm package/version input and local archive comparison.
- Source repository/revision resolution with evidence, confidence, and manual override.
- File inventory, exact hashes, added/removed/modified files, and inspectable text diffs.
- Evidence-based explanations for packaging rules and declared build outputs.
- Suspicious-change checks, particularly published-only executable behavior and lifecycle-script changes.
- Meaningful open-weight model integration for contextual explanation and prioritization.
- Finished review UI, CLI, JSON/Markdown report export.
- Watchlist command and scheduled GitHub Actions example for new releases.
- Passing CI, documented installation, real example outputs, and reproducible evaluation.

### Explicit boundaries

- No PyPI implementation in the initial delivery.
- No execution of package install hooks or repository build scripts.
- No universal reproducible-build verification or guaranteed malware detection.
- No automatic claim that bundles, minified files, or source maps are trustworthy.
- No automatic comments or issues on external projects.
- No accounts, billing, or multi-tenant hosting. The primary deployment is a local application and CLI, with a reproducible demo environment.

## Architecture

Proposed stack: TypeScript analysis engine and CLI; Node HTTP service; React/Vite review UI; SQLite for local analysis history and watchlists. Verify available runtimes and dependencies before finalizing versions.

Keep the analysis engine independent of UI and transport. The CLI, UI, and scheduled monitor must use the same pipeline and report schema.

1. **Input and retrieval:** npm registry metadata, release archive, Git source snapshot, or explicit local inputs.
2. **Source resolver:** repository metadata, release commit metadata when present, matching tags, and explicit user revision. Record the chosen revision and how it was selected. Do not silently treat a tag guess as verified identity.
3. **Inventory:** archive paths, types, sizes, hashes, package manifest, and source tree. Preserve raw hashes; any normalized comparison is a separate result.
4. **Comparison:** path mapping, monorepo package roots, file status, text diffs, binary/unreadable-file handling, and packaging configuration evidence.
5. **Analysis:** deterministic behavior checks plus contextual model assessment using bounded evidence excerpts.
6. **Reporting:** stable finding identifiers, source/package line references, evidence, severity, confidence, limitations, and machine-readable coverage.
7. **Monitoring:** persist last analyzed version and artifact digest; scheduled invocations detect unseen releases and save reports. Scheduling must work without the UI remaining open.

Suggested modules: `core`, `sources/npm`, `sources/git`, `comparison`, `rules`, `ai`, `reports`, `cli`, `server`, and `web`.

## Evidence and classification contract

Keep impact severity separate from evidence confidence. Every finding must reference actual files, excerpts, and analysis inputs. Model-provided paths and line references must be checked against the inventory.

| Classification | Required treatment |
| --- | --- |
| Exact match | Raw file hashes match at the resolved source mapping. |
| Explained packaging difference | Cite the relevant manifest/configuration and the observed difference; explanation does not imply overall safety. |
| Declared generated output | Show build configuration or source-map evidence; label equivalence unverified unless independently established. |
| Suspicious change | Show the precise added or modified behavior and why it matters. |
| Unresolved | State missing source identity, unsupported transformations, truncated analysis, or other uncertainty. |

If source resolution is uncertain, carry that limitation into every dependent conclusion. Never label a partially analyzed package as clean. Do not describe npm provenance or attestations as verified unless actual verification has been implemented and tested.

Initial rule families: added/changed lifecycle scripts; executable content present only in the archive; added network-and-execution behavior; sensitive environment/file access introduced by a diff; unexplained changes to distributed source. Individual signals are context for review, not proof of malicious intent.

AI must perform meaningful contextual work: explain selected differences, assess whether packaging evidence supports an explanation, and prioritize review. Use a configurable open-weight model endpoint or local runtime verified in hour 1. Validate structured output, bound context, and record model identity. Model outages must produce an explicit partial report rather than fabricated explanations.

## User interface

- **New analysis:** npm name/version or local archive, optional source override, clear input validation.
- **Progress:** retrieval, resolution, comparison, assessment; actionable errors and retry.
- **Overview:** analyzed version/digest, selected source revision, coverage, findings by severity, unresolved items.
- **Review:** searchable file tree, source/package diff, evidence cards, packaging rationale, and model explanation distinguished from deterministic evidence.
- **History and watchlist:** previous analyses, latest checked release, monitor status.
- **Exports:** JSON for automation and Markdown for review.

Prioritize readable code, clear hierarchy, keyboard accessibility, and complete loading/error/empty states. Do not spend time on decorative dashboards or unsupported metrics.

## Four-member ownership and parallel delivery

Four members work concurrently after a shared 30-minute setup. Target a fully integrated product by hour 6, then use the remaining four hours for evaluation, hardening, and presentation. Parallel work increases capacity; it does not eliminate integration dependencies.

| Owner | Responsibility | Owned paths | Acceptance criteria |
| --- | --- | --- | --- |
| Member 1 — ingestion and source engineering | Registry downloads, safe archive inspection, Git snapshots, revision resolution, monorepo roots, inventory | `sources/`, `inventory/` | Real and local artifacts become reproducible inventories; unsafe archives are rejected; source ambiguity is explicit. |
| Member 2 — comparison and intelligence | File mapping, diffs, packaging evidence, suspicious-change rules, model integration, finding validation | `comparison/`, `rules/`, `ai/` | Engine distinguishes controlled tampering from ordinary differences and produces verifiable references; model failures remain explicit. |
| Member 3 — frontend and product experience | Input flow, progress, overview, file tree, diff viewer, evidence cards, history/watchlist views | `web/` | All screens use the agreed API; core user journey works on real data with loading, error, and empty states. |
| Member 4 — integration and delivery lead | Shared contracts, pipeline orchestration, API, CLI, persistence, monitoring, CI, evaluation harness | `core/`, `server/`, `cli/`, `reports/`, `tests/e2e/`, `.github/` | UI and CLI share one engine; integration checks pass; scheduled monitoring and exports work. |

Each member writes tests and documentation for their own module. Member 4 coordinates evaluation and release work rather than writing everyone else's tests. In hours 7–10, Members 1 and 2 handle engine corrections, Member 3 handles UX and demo assets, and Member 4 runs integration and release checks. Assign actual names by strength before coding; no extra skill installation is required to divide work.

### First 30 minutes: shared contract, then independent work

1. Confirm team details, selected model/runtime, available clock time, and required initial repository commit.
2. Member 4 creates the scaffold and versioned shared schemas through a PR. All members agree on the contracts below before implementation diverges.
3. Create small shared fixture inputs and schema-valid example reports for clean, suspicious, unresolved, and failed analyses. These are development fixtures, clearly distinguished from actual analyzer output.
4. Each member starts a separate branch/worktree with the agreed directory ownership. Member 3 builds against fixtures while Members 1 and 2 implement the real pipeline.

### Interface contracts to freeze early

These are proposed interface names, to be finalized in the shared scaffold:

- `AnalysisRequest`: npm name/version or local archive handle, optional source revision/root override, processing limits.
- `ResolvedInputs`: archive digest, package metadata, source commit/root, resolution evidence, limitations.
- `FileInventory`: logical paths, file types, sizes, raw hashes, and bounded content access. Local filesystem paths stay internal.
- `ComparisonResult`: file mapping, statuses, diff hunks, source/package line references, packaging evidence, coverage limitations.
- `Finding`: stable ID, rule/category, severity, confidence, exact evidence references, explanation, optional model attribution.
- `AnalysisReport`: schema version, input identities, stage/status, coverage, findings, model status, timing, and errors.
- `WatchEntry`: package name, last checked version/digest, analysis reference, check status.

Pipeline boundaries: Member 1 produces resolved inputs and inventories; Member 2 consumes inventories and produces comparisons/findings; Member 4 orchestrates stages and persists the final report; Member 3 consumes only the API schema.

Proposed API: `POST /api/analyses`, `GET /api/analyses/:id`, `GET /api/analyses/:id/files/:fileId`, `GET /api/analyses/:id/export?format=json|markdown`, and watchlist list/create/delete endpoints. Use an upload endpoint returning an opaque archive handle for local files; do not accept arbitrary server filesystem paths from the browser. Start with bounded polling for progress. Evidence content must be addressable by validated file identifiers.

Only Member 4 edits shared schemas, root dependency manifests, and lockfiles after coordinating requests. Breaking contract changes require updating fixtures and consumers in the same integration cycle.

### Parallel schedule and integration gates

Hours are elapsed development time, not clock times. Confirm available time against actual submission deadlines before starting.

| Time | Member 1 | Member 2 | Member 3 | Member 4 | Shared gate |
| --- | --- | --- | --- | --- | --- |
| 0:00–0:30 | Agree contracts and retrieval fixtures | Agree evidence schema; verify model access | Agree API and wireframes | Scaffold, contracts, CI, workflow | Shared schemas and fixtures available; correct initial commit preserved. |
| 0:30–2:00 | Registry/archive input and inventory | Diff engine on inventories; initial rules; model check | Complete primary screens against fixtures | Job API, pipeline skeleton, CLI skeleton | Each module runs independently; model connectivity verified. |
| 2:00–3:00 | Source revision/root resolution | Wire real inventories into comparison | Connect submission/progress/report screens | Wire pipeline and API | First real npm analysis reaches UI and CLI, even with incomplete classifications. |
| 3:00–4:30 | Ambiguity, monorepos, retrieval edge cases | Packaging evidence, AI explanations, evidence validation | Diff/evidence review, uploads, exports | Persistence, reports, monitor command | Real release and modified archive both produce inspectable findings. |
| 4:30–6:00 | Archive/source tests and fixes | False-positive checks and rule tests | History/watchlist, accessibility and error states | Scheduled workflow, end-to-end checks, installation | Feature-complete workflow; monitoring works; feature freeze. |
| 6:00–8:00 | Evaluate source resolution and archive cases | Held-out detection evaluation and fixes | Real-data UX checks and polish | Record metrics; cross-interface regression checks | Measured evaluation, explicit limitations, no unresolved critical failures. |
| 8:00–9:00 | Retrieval/setup documentation; clean-install support | Analysis/model documentation; real output examples | Demo preparation and UI regressions | Fresh-install test, final integration/CI | Reproducible release candidate. |
| 9:00–10:00 | Explain ingestion/source matching | Explain evidence and model role | Lead product demonstration | Verify submission and final CI | Rehearsed team demo and complete submission before deadline. |

### Collaboration and review protocol

- Branches: `codex/ingestion`, `codex/analysis`, `codex/ui`, and `codex/integration`; all post-initial changes go through PRs.
- Small PRs, with integration checkpoints around hours 2, 3, 4.5, and 6. Do not defer merges until the end.
- Review pairing: Members 1 and 2 review each other's engine work; Members 3 and 4 review UI/API changes. Member 4 coordinates merge order, not all reviews.
- Every member owns their module's tests and contributes installation/usage notes as functionality lands.
- A dependency blocker lasting more than 15 minutes triggers a team check-in; continue against the shared fixtures when appropriate.
- New dependencies go through Member 4 to avoid lockfile conflicts. Avoid editing another owner's paths without coordination.
- Use the same pinned runtime/package-manager version. Never commit credentials or local model downloads.
- Before presenting, each member explains their module to the other three. All members must understand the end-to-end implementation.

### Stretch work policy

Do not use parallel capacity to immediately add PyPI or arbitrary build execution. Only after the hour-6 gate passes may the team consider better explanation of generated outputs or richer comparison navigation. Preserve hours 8–10 for delivery. A working product by hour 6 is a target, not a promise of fourfold speedup.

## Reliability and input safety

- Enforce archive limits for entry count, uncompressed size, individual files, nesting, and execution time.
- Reject path traversal, absolute paths, and unsafe symlinks/hardlinks; never write outside the analysis workspace.
- Never execute fetched package or repository code.
- Validate repository URLs, constrain redirects and supported hosts, and prevent server-side access to local/private network addresses for remote fetches.
- Use argument arrays for subprocesses, isolated temporary directories, timeouts, and bounded concurrency.
- Treat repository text and model output as untrusted content; escape UI output and ignore embedded instructions.
- Handle registry failures, missing revisions, rate limits, malformed archives, binary files, and model errors explicitly.
- Record release version, archive digest, source commit, tool/rule versions, model identity, and incomplete-analysis reasons.
- Keep credentials out of reports and logs; document model data flow and configuration.

## Evaluation plan

Use an initial target of 6–10 manageable real releases spanning plain JavaScript, transpiled output, bundled output, and a monorepo package. These are legitimate-release controls, not assumed ground-truth malware-free packages.

Create controlled modified copies with independent cases for lifecycle-script injection, outbound-request injection, unexpected executable content, and a modified distributed source file. Include harmless additions and an unresolved-source case.

Separate development fixtures from held-out evaluation inputs. Report sample counts, detection rate on planted changes, false-positive findings on controls, source-resolution success, unresolved cases, and analysis time. Manually inspect alerts on controls; do not infer perfect precision from the absence of known attacks.

Required tests cover archive handling, source ambiguity, path mapping, diff evidence locations, model schema/reference validation, CLI exit semantics, monitor state, and an end-to-end analysis. Include actual generated reports in `examples/`.

## Hackathon compliance

According to the supplied event document:

- Start a new empty public repository. The first commit must contain **only `HACKATHON.md`** with team members, selected problem, models, and rationale.
- This roadmap is a local planning artifact. Do not include it in that first commit; add it through a later PR.
- Every subsequent change must go through a PR using the required template and disclosure fields.
- Include MIT or Apache-2.0 licensing, `README.md`, `.github/pull_request_template.md`, `.github/workflows/ci.yml`, and `examples/`.
- CI must install dependencies and run relevant tests on PRs, and pass for the final submission.
- An open-source or open-weight model must do meaningful product work. Disclose coding assistants separately.
- Use public data and do not publish automated issues/comments on real projects.
- The repository-link submission deadline stated in the document is **8:30 PM, 31 October 2026**, in the event's local time (India). Do not assume a fresh ten-hour window extends that deadline.

## Contingencies and scope discipline

- Ambiguous source identity: require an override or show an inconclusive report; never manufacture certainty.
- Missing model access: resolve during hour 1. Do not postpone the mandatory integration until the final hour.
- Complex generated artifacts: preserve and explain uncertainty; do not suppress them as safe.
- Schedule pressure: cut animation, rich history filters, and ancillary visualizations before cutting evidence, archive controls, tests, model integration, or monitoring.
- Hosted deployment delays: deliver the verified local application/CLI and reproducible demo. Public multi-user hosting is outside this scope.

## Final demo

1. Analyze a real npm release and explain an ordinary packaging difference.
2. Analyze a controlled modified copy of that release.
3. Open the exact injected behavior and its evidence-backed assessment.
4. Show a genuinely unresolved case without claiming safety.
5. Export a report and demonstrate the scheduled monitor using a controlled release fixture.
6. Present measured evaluation results, limitations, passing CI, and installation instructions.

Success means a complete, reproducible workflow with defensible findings and a clear demonstration. Winning and long-term production reliability cannot be guaranteed by a ten-hour build.
