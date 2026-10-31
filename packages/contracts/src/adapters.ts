import type {
  AnalysisReport,
  AnalysisRequest,
  FileDetail,
  Stage,
} from "./index.js";

/** Logical paths are archive-root-relative. No symlinks or directories in entries. */
export interface SnapshotEntry {
  path: string;
  sizeBytes: number;
  sha256: string;
}
export interface TextContent {
  text: string | null;
  binary: boolean;
  truncated: boolean;
}
export interface Snapshot {
  sha256: string;
  entries: readonly SnapshotEntry[];
  /** Must return at most maxBytes UTF-8 bytes, never execute content. */
  readText(
    path: string,
    maxBytes: number,
    signal?: AbortSignal,
  ): Promise<TextContent>;
}
export interface PackageMetadata {
  name?: string;
  version?: string;
  repository?: { url: string; directory?: string };
  gitHead?: string;
}
export interface ArtifactSnapshot extends Snapshot {
  metadata: PackageMetadata;
  /** e.g. "package" for standard npm tarballs. Empty for normalized inputs. */
  root: string;
}
export interface SourceSnapshot extends Snapshot {
  repositoryUrl?: string;
  commit?: string;
}
export interface Limits {
  maxEntries: number;
  maxFindings: number;
  maxTextBytes: number;
  maxTotalTextBytes: number;
  maxModelInputChars: number;
  maxModelFiles: number;
  maxDiffChars: number;
  maxModelOutputBytes: number;
}
export interface AdapterContext {
  signal: AbortSignal;
  workspaceDir: string;
  limits: Readonly<Limits>;
  resolveUpload: (id: string, purpose: "package" | "source") => Promise<string>;
}
export interface IngestionAdapter {
  fetchNpmArtifact(
    input: Extract<AnalysisRequest["artifact"], { kind: "npm" }>,
    context: AdapterContext,
  ): Promise<ArtifactSnapshot>;
  fetchGithubSnapshot(
    input: { repositoryUrl: string; commit: string },
    context: AdapterContext,
  ): Promise<SourceSnapshot>;
  inspectUploadedArchive(
    input: { uploadId: string; purpose: "package" },
    context: AdapterContext,
  ): Promise<ArtifactSnapshot>;
  inspectUploadedArchive(
    input: { uploadId: string; purpose: "source" },
    context: AdapterContext,
  ): Promise<SourceSnapshot>;
  /** Resolve tag to a full immutable commit; return null only for a missing tag. */
  resolveGithubRef?(
    input: { repositoryUrl: string; ref: string },
    context: AdapterContext,
  ): Promise<string | null>;
}
export interface ModelClient {
  readonly id: string;
  complete(input: {
    system: string;
    prompt: string;
    signal: AbortSignal;
  }): Promise<unknown>;
}
export interface AnalyzeDependencies {
  analysisId: string;
  ingestion: IngestionAdapter;
  workspaceDir: string;
  resolveUpload: AdapterContext["resolveUpload"];
  saveFileDetail: (analysisId: string, detail: FileDetail) => Promise<void>;
  model?: ModelClient;
  signal?: AbortSignal;
  limits?: Partial<Limits>;
  /** Default 90 seconds for the entire model stage, including custom adapters. */
  modelTimeoutMs?: number;
  now?: () => Date;
}
export type ProgressHandler = (stage: Stage) => void | Promise<void>;
export type Analyze = (
  request: AnalysisRequest,
  dependencies: AnalyzeDependencies,
  onProgress?: ProgressHandler,
) => Promise<AnalysisReport>;
