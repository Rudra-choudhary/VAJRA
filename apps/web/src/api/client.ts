import {
  AnalysisJobSchema,
  AnalysisRequestSchema,
  AnalysisSummarySchema,
  ApiErrorSchema,
  FileDetailSchema,
  WatchEntrySchema,
  type AnalysisJob,
  type AnalysisRequest,
  type FileDetail,
  type WatchEntry,
} from "@vajra/contracts";
import {
  VajraApiError,
  type ListAnalysesResult,
  type ListWatchlistResult,
  type UploadResult,
  type VajraTransport,
} from "./transport.js";
import { z } from "zod";

const UploadResultSchema = z.object({
  uploadId: z.string().min(1),
  filename: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
});

const AnalysisSubmissionSchema = z.object({
  id: z.string().min(1),
  status: z.literal("queued"),
});

const ListAnalysesSchema = z.object({
  items: z.array(AnalysisSummarySchema),
  nextCursor: z.string().nullable(),
});

const ListWatchlistSchema = z.object({
  items: z.array(WatchEntrySchema),
});

export class HttpVajraClient implements VajraTransport {
  readonly isMock = false;
  readonly name = "Live API";
  private readonly baseUrl: string;

  constructor(baseUrl = "") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private async handleResponse<T>(
    res: Response,
    schema?: z.ZodType<T>,
  ): Promise<T> {
    if (!res.ok) {
      let errorObj;
      try {
        const json = await res.json();
        if (json && typeof json === "object" && "error" in json) {
          const parsed = ApiErrorSchema.safeParse(json.error);
          if (parsed.success) {
            errorObj = parsed.data;
          }
        }
      } catch {
        // Response was not JSON
      }

      if (!errorObj) {
        errorObj = {
          code: `HTTP_${res.status}`,
          message: `Server returned HTTP ${res.status} ${res.statusText}`,
          retryable: res.status >= 500 || res.status === 429,
        };
      }
      throw new VajraApiError(errorObj, res.status);
    }

    if (res.status === 204) {
      return undefined as unknown as T;
    }

    const json = await res.json();
    if (schema) {
      return schema.parse(json);
    }
    return json as T;
  }

  async uploadFile(
    file: File,
    purpose: "package" | "source",
  ): Promise<UploadResult> {
    const formData = new FormData();
    formData.append("purpose", purpose);
    formData.append("file", file);

    const res = await fetch(`${this.baseUrl}/api/uploads`, {
      method: "POST",
      body: formData,
    });
    return this.handleResponse(res, UploadResultSchema);
  }

  async submitAnalysis(
    request: AnalysisRequest,
  ): Promise<{ id: string; status: "queued" }> {
    const validatedRequest = AnalysisRequestSchema.parse(request);
    const res = await fetch(`${this.baseUrl}/api/analyses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validatedRequest),
    });
    return this.handleResponse(res, AnalysisSubmissionSchema);
  }

  async getAnalysis(id: string): Promise<AnalysisJob> {
    const res = await fetch(
      `${this.baseUrl}/api/analyses/${encodeURIComponent(id)}`,
    );
    const raw: any = await this.handleResponse(res);

    // Resilient shape normalization (handles D1 missing stage or server omission)
    if (raw && typeof raw === "object") {
      if (!raw.stage) {
        if (raw.status === "completed" || raw.status === "partial") {
          raw.stage = "done";
        } else if (raw.status === "queued") {
          raw.stage = "queued";
        } else {
          raw.stage = "retrieving";
        }
      }
    }

    return AnalysisJobSchema.parse(raw);
  }

  async listAnalyses(params?: {
    limit?: number;
    cursor?: string;
  }): Promise<ListAnalysesResult> {
    const query = new URLSearchParams();
    if (params?.limit !== undefined) query.set("limit", String(params.limit));
    if (params?.cursor) query.set("cursor", params.cursor);

    const qs = query.toString();
    const url = `${this.baseUrl}/api/analyses${qs ? `?${qs}` : ""}`;
    const res = await fetch(url);
    const raw: any = await this.handleResponse(res);

    // Normalize SQL nulls to undefined for contract schema compatibility
    if (raw && Array.isArray(raw.items)) {
      raw.items = raw.items.map((item: any) => ({
        ...item,
        name: item.name ?? undefined,
        version: item.version ?? undefined,
      }));
    }

    return ListAnalysesSchema.parse(raw);
  }

  async getFileDetail(analysisId: string, fileId: string): Promise<FileDetail> {
    const url = `${this.baseUrl}/api/analyses/${encodeURIComponent(analysisId)}/files/${encodeURIComponent(fileId)}`;
    const res = await fetch(url);
    return this.handleResponse(res, FileDetailSchema);
  }

  async exportReport(
    analysisId: string,
    format: "json" | "markdown",
  ): Promise<{ blob: Blob; filename: string }> {
    const url = `${this.baseUrl}/api/analyses/${encodeURIComponent(analysisId)}/export?format=${encodeURIComponent(format)}`;
    const res = await fetch(url);
    if (!res.ok) {
      await this.handleResponse(res); // Will throw structured VajraApiError
    }

    const disposition = res.headers.get("Content-Disposition");
    let filename = `vajra-report-${analysisId}.${format === "json" ? "json" : "md"}`;
    if (disposition) {
      const match = disposition.match(/filename=["']?([^"';]+)["']?/i);
      if (match?.[1]) filename = match[1];
    }

    const blob = await res.blob();
    return { blob, filename };
  }

  async listWatchlist(): Promise<ListWatchlistResult> {
    const res = await fetch(`${this.baseUrl}/api/watchlist`);
    return this.handleResponse(res, ListWatchlistSchema);
  }

  async addToWatchlist(name: string): Promise<WatchEntry> {
    const res = await fetch(`${this.baseUrl}/api/watchlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return this.handleResponse(res, WatchEntrySchema);
  }

  async removeFromWatchlist(id: string): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/api/watchlist/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
    );
    return this.handleResponse(res);
  }

  async checkHealth(): Promise<{ status: "ok" }> {
    const res = await fetch(`${this.baseUrl}/api/health`);
    return this.handleResponse(res, z.object({ status: z.literal("ok") }));
  }
}
