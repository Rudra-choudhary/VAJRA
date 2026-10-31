import {
  AnalysisRequestSchema,
  AnalysisReportSchema,
  FileDetailSchema,
  IdSchema,
  PackageRootSchema,
  type AnalysisReport,
  type AnalyzeDependencies,
  type ProgressHandler,
  type ArtifactSnapshot,
  type Limits,
} from "@vajra/contracts";
import {
  ContentReader,
  DEFAULT_LIMITS,
  checkSnapshot,
  EngineError,
} from "./snapshot.js";
import { resolveSource } from "./source.js";
import { compare } from "./compare.js";
import { runRules } from "./rules.js";
import { explain, validateEvidence } from "./model.js";
export {
  createOllamaClient,
  ModelOutputSchema,
  validateEvidence,
} from "./model.js";
export { EngineError, DEFAULT_LIMITS } from "./snapshot.js";
export { resolveSource } from "./source.js";
export { compare } from "./compare.js";
export { runRules } from "./rules.js";

export async function analyze(
  raw: unknown,
  deps: AnalyzeDependencies,
  onProgress: ProgressHandler = () => {},
): Promise<AnalysisReport> {
  const started = performance.now();
  const request = AnalysisRequestSchema.parse(raw);
  IdSchema.parse(deps.analysisId);
  const signal = deps.signal ?? new AbortController().signal;
  signal.throwIfAborted();
  const limits: Limits = { ...DEFAULT_LIMITS, ...deps.limits };
  for (const n of Object.values(limits))
    if (!Number.isSafeInteger(n) || n <= 0)
      throw new EngineError(
        "INVALID_LIMITS",
        "Limits must be positive integers",
      );
  const context = {
    signal,
    limits,
    workspaceDir: deps.workspaceDir,
    resolveUpload: deps.resolveUpload,
  };
  const progress = async (stage: Parameters<ProgressHandler>[0]) => {
    signal.throwIfAborted();
    await onProgress(stage);
  };
  await progress("retrieving");
  const artifact: ArtifactSnapshot =
    request.artifact.kind === "npm"
      ? await deps.ingestion.fetchNpmArtifact(request.artifact, context)
      : await deps.ingestion.inspectUploadedArchive(
          { uploadId: request.artifact.uploadId, purpose: "package" },
          context,
        );
  checkSnapshot(artifact, limits);
  PackageRootSchema.parse(artifact.root);
  const reader = new ContentReader(limits, signal);
  const manifest = await reader.manifest(
    artifact,
    artifact.root ? artifact.root + "/package.json" : "package.json",
  );
  if (!manifest)
    throw new EngineError(
      "INVALID_ARTIFACT",
      "Artifact has no readable valid package.json",
    );
  const name =
    typeof manifest.name === "string" ? manifest.name : artifact.metadata.name;
  const version =
    typeof manifest.version === "string"
      ? manifest.version
      : artifact.metadata.version;
  if (
    request.artifact.kind === "npm" &&
    (name !== request.artifact.name || version !== request.artifact.version)
  )
    throw new EngineError(
      "ARTIFACT_IDENTITY_MISMATCH",
      "Artifact manifest does not match the requested exact package version",
    );
  // Do not mutate adapter-owned metadata. Manifest identity anchors root matching.
  const input = {
    ...artifact,
    metadata: {
      ...artifact.metadata,
      ...(name ? { name } : {}),
      ...(version ? { version } : {}),
    },
    readText: artifact.readText.bind(artifact),
  };
  await progress("resolving");
  const source = await resolveSource(
    request,
    input,
    deps.ingestion,
    context,
    reader,
  );
  await progress("comparing");
  const comparison = await compare(
    input,
    source.snapshot,
    source.resolution.packageRoot ?? "",
    reader,
    limits,
  );
  let findings = runRules(
    comparison.details,
    source.resolution,
    comparison.relocations,
    limits.maxFindings,
  );
  const reasons = [...reader.limitations];
  if (findings.length >= limits.maxFindings)
    reasons.push(
      "Finding limit reached; additional review signals may be omitted",
    );
  if (!source.snapshot || source.resolution.confidence === "low")
    reasons.push(...source.resolution.limitations);
  if (comparison.details.some((d) => d.file.status === "skipped"))
    reasons.push("Some changed files could not be fully inspected");
  await progress("assessing");
  let model: AnalysisReport["model"] = {
    id: deps.model?.id ?? null,
    status: "not_configured",
    reason: "No model configured; deterministic checks only",
  };
  if (deps.model) {
    const controller = new AbortController();
    const modelSignal = AbortSignal.any([signal, controller.signal]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    try {
      const timeout = deps.modelTimeoutMs ?? 90000;
      if (!Number.isFinite(timeout) || timeout < 1)
        throw new EngineError(
          "INVALID_LIMITS",
          "Model timeout must be positive",
        );
      const interrupted = new Promise<never>((_, reject) => {
        onAbort = () => reject(modelSignal.reason ?? new Error("Aborted"));
        modelSignal.addEventListener("abort", onAbort, { once: true });
        timer = setTimeout(
          () =>
            controller.abort(
              new EngineError("MODEL_TIMEOUT", "Model assessment timed out"),
            ),
          timeout,
        );
        if (modelSignal.aborted) onAbort();
      });
      const result = await Promise.race([
        explain(findings, comparison.details, deps.model, limits, modelSignal, {
          artifact: { name, version },
          source: {
            method: source.resolution.method,
            confidence: source.resolution.confidence,
          },
          coverage: {
            totalFiles: comparison.details.length,
            comparedFiles: comparison.details.filter(
              (d) => d.file.status !== "skipped",
            ).length,
            skippedFiles: comparison.details.filter(
              (d) => d.file.status === "skipped",
            ).length,
          },
          limitations: reasons,
          findingCounts: Object.fromEntries(
            ["high", "medium", "low", "info"].map((severity) => [
              severity,
              findings.filter((finding) => finding.severity === severity).length,
            ]),
          ),
        }),
        interrupted,
      ]);
      findings = result.findings;
      reasons.push(...result.limitations);
      model = { id: deps.model.id, status: "used", summary: result.summary };
    } catch (error) {
      signal.throwIfAborted();
      model = {
        id: deps.model.id,
        status: "failed",
        reason:
          error instanceof EngineError
            ? error.message
            : "Model response failed validation or could not be retrieved",
      };
    } finally {
      if (timer) clearTimeout(timer);
      if (onAbort) modelSignal.removeEventListener("abort", onAbort);
      controller.abort();
    }
  }
  if (model.status !== "used")
    reasons.push(model.reason ?? "Model assessment incomplete");
  for (const f of findings)
    for (const e of f.evidence) validateEvidence(e, comparison.details);
  for (const detail of comparison.details) {
    detail.file.findingIds = findings
      .filter((f) => f.evidence.some((e) => e.fileId === detail.file.id))
      .map((f) => f.id);
  }
  const skipped = comparison.details.filter(
    (d) => d.file.status === "skipped",
  ).length;
  const report = AnalysisReportSchema.parse({
    schemaVersion: 1,
    id: deps.analysisId,
    status: reasons.length ? "partial" : "completed",
    createdAt: (deps.now ?? (() => new Date()))().toISOString(),
    request,
    artifact: {
      ...(name ? { name } : {}),
      ...(version ? { version } : {}),
      sha256: artifact.sha256,
    },
    source: source.resolution,
    coverage: {
      totalFiles: comparison.details.length,
      comparedFiles: comparison.details.length - skipped,
      skippedFiles: skipped,
      reasons: [...new Set(reasons)],
    },
    files: comparison.details.map((d) => d.file),
    findings,
    model,
    toolVersion: "0.1.0",
    rulesVersion: "1",
    durationMs: performance.now() - started,
  });
  for (const detail of comparison.details) {
    signal.throwIfAborted();
    await deps.saveFileDetail(deps.analysisId, FileDetailSchema.parse(detail));
  }
  await progress("done");
  return report;
}
