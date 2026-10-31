import type {
  AnalysisJob,
  AnalysisRequest,
  AnalysisSummary,
  FileDetail,
  WatchEntry,
} from "@vajra/contracts";
import {
  VajraApiError,
  type ListAnalysesResult,
  type ListWatchlistResult,
  type UploadResult,
  type VajraTransport,
} from "./transport.js";
import { FIXTURES, type FixtureId } from "./fixtures/index.js";
import { generateMarkdownReport } from "../utils/markdownExport.js";

export class MockVajraClient implements VajraTransport {
  readonly isMock = true;
  readonly name = "Contract Fixtures";

  private currentFixtureId: FixtureId = "suspicious";
  private customJobOverrides = new Map<string, AnalysisJob>();

  private watchlist: WatchEntry[] = [
    {
      id: "watch_lodash",
      name: "lodash",
      lastCheckedAt: "2026-10-31T18:00:00.000Z",
      lastVersion: "4.17.21",
      lastDigest:
        "874505386c056bd8ab3f747f5cdc958772f5a6a7e32cccb6324921531781fd25",
      lastAnalysisId: "fixture_clean",
      lastError: null,
    },
    {
      id: "watch_event_stream",
      name: "event-stream",
      lastCheckedAt: "2026-10-31T20:30:00.000Z",
      lastVersion: "3.3.6",
      lastDigest:
        "d50946370ef14e7b7c39c5fc60fb91deec09e8f68bfca468de68202996a1ef70",
      lastAnalysisId: "fixture_suspicious",
      lastError: null,
    },
    {
      id: "watch_demo_partial",
      name: "demo-package",
      lastCheckedAt: "2026-10-31T21:15:00.000Z",
      lastVersion: "1.0.0",
      lastDigest:
        "d50946370ef14e7b7c39c5fc60fb91deec09e8f68bfca468de68202996a1ef70",
      lastAnalysisId: "fixture_partial",
      lastError: null,
    },
  ];

  setFixture(id: FixtureId): void {
    if (FIXTURES[id]) {
      this.currentFixtureId = id;
    }
  }

  getFixtureId(): FixtureId {
    return this.currentFixtureId;
  }

  async uploadFile(
    file: File,
    purpose: "package" | "source",
  ): Promise<UploadResult> {
    await new Promise((r) => setTimeout(r, 200));
    return {
      uploadId: `mock_upload_${purpose}_${Date.now().toString(36)}`,
      filename: file.name,
      sizeBytes: file.size,
    };
  }

  async submitAnalysis(
    request: AnalysisRequest,
  ): Promise<{ id: string; status: "queued" }> {
    await new Promise((r) => setTimeout(r, 150));
    // Check if user specifically requested a package or upload
    let targetFixtureId: FixtureId = this.currentFixtureId;
    if (request.artifact.kind === "npm") {
      const name = request.artifact.name.toLowerCase();
      if (name.includes("clean") || name.includes("lodash")) {
        targetFixtureId = "clean";
      } else if (name.includes("suspicious") || name.includes("backdoor")) {
        targetFixtureId = "suspicious";
      } else if (name.includes("partial")) {
        targetFixtureId = "partial";
      } else if (name.includes("fail") || name.includes("error")) {
        targetFixtureId = "failed";
      }
    }

    const fixture = FIXTURES[targetFixtureId] ?? FIXTURES.suspicious;
    if (!fixture) {
      throw new Error(`Fixture ${targetFixtureId} not found`);
    }
    this.currentFixtureId = targetFixtureId;
    return {
      id: fixture.job.id,
      status: "queued",
    };
  }

  async getAnalysis(id: string): Promise<AnalysisJob> {
    await new Promise((r) => setTimeout(r, 100));

    // Check custom overrides first
    if (this.customJobOverrides.has(id)) {
      return this.customJobOverrides.get(id)!;
    }

    // Match fixture by ID or name
    for (const [key, fix] of Object.entries(FIXTURES)) {
      if (fix.job.id === id || key === id) {
        return fix.job;
      }
    }

    // Default to active fixture
    const active = FIXTURES[this.currentFixtureId];
    if (active) {
      return active.job;
    }

    throw new VajraApiError(
      {
        code: "ANALYSIS_NOT_FOUND",
        message: `Analysis job ${id} was not found in mock repository`,
        retryable: false,
      },
      404,
    );
  }

  async listAnalyses(params?: {
    limit?: number;
    cursor?: string;
  }): Promise<ListAnalysesResult> {
    await new Promise((r) => setTimeout(r, 100));

    const items: AnalysisSummary[] = Object.values(FIXTURES).map((f) => {
      const report = f.job.report;
      return {
        id: f.job.id,
        name: report?.artifact.name ?? f.name,
        version: report?.artifact.version ?? "1.0.0",
        status: f.job.status,
        createdAt: report?.createdAt ?? "2026-10-31T00:00:00.000Z",
        findingCount: report?.findings.length ?? 0,
      };
    });

    const limit = params?.limit ?? 10;
    return {
      items: items.slice(0, limit),
      nextCursor: null,
    };
  }

  async getFileDetail(analysisId: string, fileId: string): Promise<FileDetail> {
    await new Promise((r) => setTimeout(r, 80));

    for (const fix of Object.values(FIXTURES)) {
      if (
        fix.job.id === analysisId ||
        fix.id === analysisId ||
        analysisId === this.currentFixtureId
      ) {
        const detail = fix.details.find((d) => d.file.id === fileId);
        if (detail) {
          return detail;
        }
      }
    }

    // Check active fixture as fallback
    const active = FIXTURES[this.currentFixtureId];
    if (active) {
      const detail = active.details.find((d) => d.file.id === fileId);
      if (detail) return detail;
    }

    throw new VajraApiError(
      {
        code: "FILE_NOT_FOUND",
        message: `File detail ${fileId} not found in analysis ${analysisId}`,
        retryable: false,
      },
      404,
    );
  }

  async exportReport(
    analysisId: string,
    format: "json" | "markdown",
  ): Promise<{ blob: Blob; filename: string }> {
    const job = await this.getAnalysis(analysisId);
    if (!job.report) {
      throw new VajraApiError(
        {
          code: "REPORT_NOT_READY",
          message: `Analysis ${analysisId} does not have a terminal report available for export`,
          retryable: false,
        },
        400,
      );
    }

    const filename = `vajra-report-${analysisId}.${format === "json" ? "json" : "md"}`;
    if (format === "json") {
      const content = JSON.stringify(job.report, null, 2);
      const blob = new Blob([content], { type: "application/json" });
      return { blob, filename };
    } else {
      const content = generateMarkdownReport(job.report);
      const blob = new Blob([content], {
        type: "text/markdown; charset=utf-8",
      });
      return { blob, filename };
    }
  }

  async listWatchlist(): Promise<ListWatchlistResult> {
    await new Promise((r) => setTimeout(r, 80));
    return { items: [...this.watchlist] };
  }

  async addToWatchlist(name: string): Promise<WatchEntry> {
    await new Promise((r) => setTimeout(r, 120));

    const existing = this.watchlist.find((w) => w.name === name);
    if (existing) {
      return existing;
    }

    const newEntry: WatchEntry = {
      id: `watch_${Date.now().toString(36)}`,
      name,
      lastCheckedAt: null,
      lastVersion: null,
      lastDigest: null,
      lastAnalysisId: null,
      lastError: null,
    };
    this.watchlist.unshift(newEntry);
    return newEntry;
  }

  async removeFromWatchlist(id: string): Promise<void> {
    await new Promise((r) => setTimeout(r, 80));
    this.watchlist = this.watchlist.filter((w) => w.id !== id);
  }

  async checkHealth(): Promise<{ status: "ok" }> {
    return { status: "ok" };
  }
}
