import type {
  AnalysisJob,
  AnalysisRequest,
  AnalysisSummary,
  FileDetail,
  WatchEntry,
  ApiError,
} from "@vajra/contracts";

export interface UploadResult {
  uploadId: string;
  filename: string;
  sizeBytes: number;
}

export interface ListAnalysesResult {
  items: AnalysisSummary[];
  nextCursor: string | null;
}

export interface ListWatchlistResult {
  items: WatchEntry[];
}

export class VajraApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number;

  constructor(error: ApiError, status = 500) {
    super(error.message);
    this.name = "VajraApiError";
    this.code = error.code;
    this.retryable = error.retryable;
    this.status = status;
  }
}

export interface VajraTransport {
  readonly isMock: boolean;
  readonly name: string;

  uploadFile(file: File, purpose: "package" | "source"): Promise<UploadResult>;
  submitAnalysis(
    request: AnalysisRequest,
  ): Promise<{ id: string; status: "queued" }>;
  getAnalysis(id: string): Promise<AnalysisJob>;
  listAnalyses(params?: {
    limit?: number;
    cursor?: string;
  }): Promise<ListAnalysesResult>;
  getFileDetail(analysisId: string, fileId: string): Promise<FileDetail>;
  exportReport(
    analysisId: string,
    format: "json" | "markdown",
  ): Promise<{ blob: Blob; filename: string }>;
  listWatchlist(): Promise<ListWatchlistResult>;
  addToWatchlist(name: string): Promise<WatchEntry>;
  removeFromWatchlist(id: string): Promise<void>;
  checkHealth(): Promise<{ status: "ok" }>;
}
