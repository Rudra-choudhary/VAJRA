# Vajra analysis engine

This package is Assignment A. Retrieval, server, UI, storage and CLI implementations belong to teammates and are not implemented by this package.

## Run

From the repository root:

```sh
npm ci --ignore-scripts
npm run check
npm run demo:engine
```

The demo produces clearly labeled, deterministic contract fixtures using a fake model. To make a real local model call:

```sh
ollama pull gemma4:e4b
VAJRA_MODEL=gemma4:e4b npm run smoke:model
```

The smoke test uses a synthetic tampered package but an actual model response. Output is saved under ignored `.vajra/`. It exits nonzero if model assessment fails. You may set `VAJRA_MODEL` to another installed model and `VAJRA_OLLAMA_URL` to a trusted Ollama origin. Only explicit configuration enables the model; there is no hidden cloud fallback or automatic model download.

## Integration

```ts
import { analyze, createOllamaClient } from '@vajra/engine';
const report = await analyze(request, {
  analysisId,
  ingestion,
  workspaceDir,
  resolveUpload,
  saveFileDetail,
  model: createOllamaClient({ model: 'gemma4:e4b' }),
  signal,
}, async stage => updateJobStage(stage));
```

Types are exported by `@vajra/contracts`. `analyze` validates input and output, emits retrieving/resolving/comparing/assessing/done, and persists validated file details through the callback. The caller stores the returned report. Models are dependency-injected, so tests are deterministic without network credentials.

## What is implemented

- Exact user-supplied commits, publisher gitHead, conservative tag fallback and explicit source snapshots.
- Monorepo package root selection by manifest name; explicit overrides; ambiguity and source identity mismatch handling.
- Raw-hash comparisons, exact-content relocations, bounded unified diffs and coverage accounting.
- Literal package `files` inclusion explanations. Globs and complex npmignore semantics remain unresolved.
- AST-based signals for introduced network calls, child-process calls, dynamic execution and selected sensitive data access. Imported aliases are supported for common patterns.
- Added/changed lifecycle scripts and published-only executable code.
- Generated-output candidates remain unverified; no build scripts are executed.
- Structured Ollama output, input/output caps, cancellation, timeouts, and validation of every model file/line/excerpt reference.
- AI explanations augment deterministic evidence and never remove or downgrade rule findings.

## Important limits

This is a review aid, not a malware detector or safety certificate. Source identity from package metadata is not authenticated provenance. Tag resolution is tentative. Static calls do not establish data flow, execution reachability or intent. Aliasing, computed access, obfuscation, unsupported languages and generated transformations can escape the initial rules.

Model citations are checked for existence and literal accuracy, not for the truth of every semantic conclusion. Model interpretation is labeled unverified. Large files or context exclusions remain visible; missing/failed model review yields partial status. A clean exact comparison says only that the selected source matches the artifact, not that either is trustworthy.

No archive extraction, package scripts, subprocess builds or network retrieval occurs in the engine itself. Adapters must enforce archive/network safety and return accurate snapshots. UI/API integration and operational persistence are separate team workstreams.

## Tests and fixture policy

`npm run check` typechecks production source and runs offline tests for tampering, source mismatch, ambiguous tags/roots, path validation, text limits, model hallucinations, cancellation and persistence errors. Development fixtures are not held-out evaluation. Report measured real-package evaluation separately; do not infer general detection accuracy from the test count.
