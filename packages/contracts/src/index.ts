import { z } from "zod";

export const IdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const CommitSchema = z.string().regex(/^[a-f0-9]{40}$/i);
export const LogicalPathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (p) =>
      !p.startsWith("/") &&
      !p.includes("\\") &&
      !/[\x00-\x1f\x7f]/.test(p) &&
      !p.includes(":") &&
      p.split("/").every((s) => s !== "" && s !== "." && s !== ".."),
    "Unsafe logical path",
  );
export const PackageRootSchema = z.union([z.literal(""), LogicalPathSchema]);
export const NpmNameSchema = z
  .string()
  .max(214)
  .regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/);
export const ExactVersionSchema = z
  .string()
  .max(100)
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);
export const GithubUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      u.hostname === "github.com" &&
      !u.port &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      /^\/[\w.-]+\/[\w.-]+(?:\.git)?\/?$/.test(u.pathname)
    );
  }, "Use an HTTPS github.com owner/repository URL");
export const StageSchema = z.enum([
  "queued",
  "retrieving",
  "resolving",
  "comparing",
  "assessing",
  "done",
]);
export const JobStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "partial",
  "failed",
]);
export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export const SeveritySchema = z.enum(["info", "low", "medium", "high"]);
export const ClassificationSchema = z.enum([
  "exact_match",
  "explained_packaging",
  "generated_unverified",
  "suspicious_change",
  "unresolved",
]);
export const ArtifactInputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("npm"),
      name: NpmNameSchema,
      version: ExactVersionSchema,
    })
    .strict(),
  z.object({ kind: z.literal("upload"), uploadId: IdSchema }).strict(),
]);
export const SourceInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("auto") }).strict(),
  z
    .object({
      kind: z.literal("github"),
      repositoryUrl: GithubUrlSchema,
      commit: CommitSchema,
      packageRoot: PackageRootSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("upload"),
      uploadId: IdSchema,
      packageRoot: PackageRootSchema.optional(),
    })
    .strict(),
]);
export const AnalysisRequestSchema = z
  .object({ artifact: ArtifactInputSchema, source: SourceInputSchema })
  .strict();
export const EvidenceRefSchema = z
  .object({
    fileId: IdSchema,
    side: z.enum(["package", "source"]),
    startLine: z.number().int().positive().optional(),
    endLine: z.number().int().positive().optional(),
    excerpt: z.string().max(8192).optional(),
  })
  .strict()
  .refine(
    (e) =>
      (e.startLine === undefined && e.endLine === undefined) ||
      (e.startLine !== undefined &&
        e.endLine !== undefined &&
        e.endLine >= e.startLine),
    "Line range must have valid start and end",
  );
export const FindingSchema = z
  .object({
    id: IdSchema,
    ruleId: IdSchema,
    title: z.string().min(1).max(200),
    classification: ClassificationSchema,
    severity: SeveritySchema,
    confidence: ConfidenceSchema,
    explanation: z.string().min(1).max(8192),
    evidence: z.array(EvidenceRefSchema).min(1).max(100),
    origin: z.enum(["rule", "model", "combined"]),
    limitations: z.array(z.string().max(1024)).max(100),
  })
  .strict();
export const FileSummarySchema = z
  .object({
    id: IdSchema,
    packagePath: LogicalPathSchema.optional(),
    sourcePath: LogicalPathSchema.optional(),
    status: z.enum(["identical", "added", "removed", "modified", "skipped"]),
    packageHash: HashSchema.optional(),
    sourceHash: HashSchema.optional(),
    binary: z.boolean(),
    truncated: z.boolean(),
    findingIds: z.array(IdSchema),
  })
  .strict()
  .refine(
    (f) => f.packagePath !== undefined || f.sourcePath !== undefined,
    "File must have a side",
  );
export const SourceResolutionSchema = z
  .object({
    repositoryUrl: GithubUrlSchema.optional(),
    commit: CommitSchema.optional(),
    snapshotSha256: HashSchema.optional(),
    packageRoot: PackageRootSchema.optional(),
    method: z.string().min(1),
    confidence: ConfidenceSchema,
    evidence: z.array(z.string()),
    limitations: z.array(z.string()),
  })
  .strict();
export const AnalysisReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: IdSchema,
    status: z.enum(["completed", "partial"]),
    createdAt: z.iso.datetime(),
    request: AnalysisRequestSchema,
    artifact: z
      .object({
        name: z.string().optional(),
        version: z.string().optional(),
        sha256: HashSchema,
      })
      .strict(),
    source: SourceResolutionSchema,
    coverage: z
      .object({
        totalFiles: z.number().int().nonnegative(),
        comparedFiles: z.number().int().nonnegative(),
        skippedFiles: z.number().int().nonnegative(),
        reasons: z.array(z.string()),
      })
      .strict(),
    files: z.array(FileSummarySchema),
    findings: z.array(FindingSchema),
    model: z
      .object({
        id: z.string().nullable(),
        status: z.enum(["used", "failed", "not_configured"]),
        reason: z.string().optional(),
        summary: z.string().min(1).max(1200).optional(),
      })
      .strict(),
    toolVersion: z.string(),
    rulesVersion: z.string(),
    durationMs: z.number().nonnegative(),
  })
  .strict()
  .superRefine((r, ctx) => {
    const ids = new Set(r.files.map((f) => f.id));
    const findings = new Set(r.findings.map((f) => f.id));
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (ids.size !== r.files.length || findings.size !== r.findings.length)
      fail("Duplicate IDs");
    if (
      r.coverage.totalFiles !== r.files.length ||
      r.coverage.comparedFiles + r.coverage.skippedFiles !==
        r.coverage.totalFiles
    )
      fail("Coverage totals disagree");
    for (const f of r.findings)
      for (const e of f.evidence) {
        const file = r.files.find((file) => file.id === e.fileId);
        if (!file) fail("Dangling evidence");
        else if (!(e.side === "package" ? file.packagePath : file.sourcePath))
          fail("Evidence references an absent side");
        else if (!file.findingIds.includes(f.id))
          fail("Finding is absent from evidence file index");
      }
    for (const f of r.files) {
      for (const id of f.findingIds)
        if (!findings.has(id)) fail("Dangling finding");
      if (
        (f.packagePath !== undefined) !== (f.packageHash !== undefined) ||
        (f.sourcePath !== undefined) !== (f.sourceHash !== undefined)
      )
        fail("File side/hash mismatch");
      if (
        f.status === "identical" &&
        (!f.packageHash || f.packageHash !== f.sourceHash)
      )
        fail("Identical file hashes disagree");
      if (
        f.status === "modified" &&
        (!f.packageHash || !f.sourceHash || f.packageHash === f.sourceHash)
      )
        fail("Modified file needs two distinct hashes");
      if (f.status === "added" && (!f.packagePath || f.sourcePath))
        fail("Added file side mismatch");
      if (f.status === "removed" && (!f.sourcePath || f.packagePath))
        fail("Removed file side mismatch");
    }
    if (r.model.status !== "not_configured" && !r.model.id)
      fail("Model result requires model identity");
    if (
      r.status === "completed" &&
      (r.coverage.skippedFiles > 0 ||
        r.model.status !== "used" ||
        r.source.method === "unresolved" ||
        r.coverage.reasons.length > 0)
    )
      fail("Incomplete analysis cannot be completed");
  });
export const FileDetailSchema = z
  .object({
    file: FileSummarySchema,
    packageText: z.string().nullable(),
    sourceText: z.string().nullable(),
    unifiedDiff: z.string(),
    truncated: z.boolean(),
  })
  .strict();
export const ApiErrorSchema = z
  .object({ code: z.string(), message: z.string(), retryable: z.boolean() })
  .strict();
/** Stable adapter failure codes. Adapters may include these in internal typed errors. */
export const IngestionErrorCodeSchema = z.enum([
  "INVALID_INPUT",
  "UNSUPPORTED_HOST",
  "NETWORK_ERROR",
  "NETWORK_TIMEOUT",
  "HTTP_ERROR",
  "REGISTRY_ERROR",
  "NOT_FOUND",
  "INTEGRITY_MISMATCH",
  "INVALID_ARCHIVE",
  "UNSAFE_ARCHIVE_ENTRY",
  "ARCHIVE_LIMIT_EXCEEDED",
  "UPLOAD_NOT_FOUND",
  "CANCELLED",
]);
export const AnalysisJobSchema = z
  .object({
    id: IdSchema,
    status: JobStatusSchema,
    stage: StageSchema,
    report: AnalysisReportSchema.optional(),
    error: ApiErrorSchema.optional(),
  })
  .strict()
  .superRefine((job, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (job.status === "completed" || job.status === "partial") {
      if (
        !job.report ||
        job.report.id !== job.id ||
        job.report.status !== job.status ||
        job.stage !== "done"
      )
        fail("Terminal job/report mismatch");
    } else if (job.report)
      fail("Nonterminal or failed job must not expose a successful report");
    if (job.status === "failed" && !job.error)
      fail("Failed job requires an error");
  });
export const AnalysisSummarySchema = z
  .object({
    id: IdSchema,
    name: z.string().optional(),
    version: z.string().optional(),
    status: JobStatusSchema,
    createdAt: z.iso.datetime(),
    findingCount: z.number().int().nonnegative(),
  })
  .strict();
export const WatchEntrySchema = z
  .object({
    id: IdSchema,
    name: NpmNameSchema,
    lastCheckedAt: z.iso.datetime().nullable(),
    lastVersion: z.string().nullable(),
    lastDigest: HashSchema.nullable(),
    lastAnalysisId: IdSchema.nullable(),
    lastError: ApiErrorSchema.nullable(),
  })
  .strict();
export type AnalysisRequest = z.infer<typeof AnalysisRequestSchema>;
export type AnalysisReport = z.infer<typeof AnalysisReportSchema>;
export type SourceResolution = z.infer<typeof SourceResolutionSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;
export type FileSummary = z.infer<typeof FileSummarySchema>;
export type FileDetail = z.infer<typeof FileDetailSchema>;
export type Stage = z.infer<typeof StageSchema>;
export type JobStatus = z.infer<typeof JobStatusSchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type Classification = z.infer<typeof ClassificationSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type IngestionErrorCode = z.infer<typeof IngestionErrorCodeSchema>;
export type AnalysisJob = z.infer<typeof AnalysisJobSchema>;
export type AnalysisSummary = z.infer<typeof AnalysisSummarySchema>;
export type WatchEntry = z.infer<typeof WatchEntrySchema>;

export type * from "./adapters.js";
