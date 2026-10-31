import { describe, expect, it } from "vitest";
import { MockVajraClient } from "../api/mockClient.js";
import { HttpVajraClient } from "../api/client.js";
import { AnalysisJobSchema, FileDetailSchema } from "@vajra/contracts";
import { FIXTURES } from "../api/fixtures/index.js";

describe("Assignment C: Transport & Fixtures", () => {
  it("validates all 4 contract fixtures against shared contracts schemas", () => {
    for (const [id, fix] of Object.entries(FIXTURES)) {
      expect(AnalysisJobSchema.safeParse(fix.job).success).toBe(true);
      for (const d of fix.details) {
        expect(FileDetailSchema.safeParse(d).success).toBe(true);
      }
    }
  });

  it("serves the suspicious fixture by default with valid finding and details", async () => {
    const mock = new MockVajraClient();
    expect(mock.isMock).toBe(true);
    expect(mock.getFixtureId()).toBe("suspicious");

    const job = await mock.getAnalysis("fixture_suspicious");
    expect(job.status).toBe("completed");
    expect(job.report).toBeDefined();
    expect(job.report?.findings.length).toBeGreaterThan(0);

    const firstFile = job.report!.files[0]!;
    const detail = await mock.getFileDetail(job.id, firstFile.id);
    expect(detail.file.id).toBe(firstFile.id);
    expect(detail.unifiedDiff).toBeDefined();
  });

  it("handles failed analysis fixture honestly with retryable flag", async () => {
    const mock = new MockVajraClient();
    mock.setFixture("failed");

    const job = await mock.getAnalysis("fixture_failed");
    expect(job.status).toBe("failed");
    expect(job.error).toBeDefined();
    expect(job.error?.code).toBe("NETWORK_ERROR");
    expect(job.error?.retryable).toBe(true);
    expect(job.report).toBeUndefined();
  });

  it("handles partial analysis fixture preserving deterministic results", async () => {
    const mock = new MockVajraClient();
    mock.setFixture("partial");

    const job = await mock.getAnalysis("fixture_partial");
    expect(job.status).toBe("partial");
    expect(job.report).toBeDefined();
    expect(job.report?.model.status).toBe("not_configured");
    expect(job.report?.coverage.reasons.length).toBeGreaterThan(0);
  });

  it("throws 404 ApiError when requested file is not in analysis", async () => {
    const mock = new MockVajraClient();
    await expect(
      mock.getFileDetail("fixture_clean", "non_existent_file_id"),
    ).rejects.toThrow(/not found/i);
  });

  it("supports report export in JSON and Markdown formats", async () => {
    const mock = new MockVajraClient();
    mock.setFixture("clean");

    const jsonExport = await mock.exportReport("fixture_clean", "json");
    expect(jsonExport.filename).toBe("vajra-report-fixture_clean.json");
    expect(jsonExport.blob.type).toBe("application/json");

    const mdExport = await mock.exportReport("fixture_clean", "markdown");
    expect(mdExport.filename).toBe("vajra-report-fixture_clean.md");
    expect(mdExport.blob.type).toContain("text/markdown");
  });

  it("manages watchlist state: list, add, remove", async () => {
    const mock = new MockVajraClient();
    const initial = await mock.listWatchlist();
    const initialCount = initial.items.length;

    const added = await mock.addToWatchlist("mocha");
    expect(added.name).toBe("mocha");
    expect(added.id).toBeDefined();

    const afterAdd = await mock.listWatchlist();
    expect(afterAdd.items.length).toBe(initialCount + 1);

    await mock.removeFromWatchlist(added.id);
    const afterDelete = await mock.listWatchlist();
    expect(afterDelete.items.length).toBe(initialCount);
  });

  it("HttpVajraClient exposes isMock=false and correct name", () => {
    const client = new HttpVajraClient("http://127.0.0.1:3000");
    expect(client.isMock).toBe(false);
    expect(client.name).toBe("Live API");
  });

  it("HttpVajraClient normalizes missing stage from server (resolving D1 shape mismatch)", async () => {
    const client = new HttpVajraClient("http://127.0.0.1:3000");
    const originalFetch = global.fetch;

    try {
      // Simulate server returning job with missing stage
      global.fetch = async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            id: "fixture_clean",
            status: "completed",
            // stage is omitted by D1 server issue
            report: FIXTURES.clean.job.report,
          }),
        }) as any;

      const job = await client.getAnalysis("fixture_clean");
      expect(job.stage).toBe("done"); // normalized to done for completed status
      expect(job.status).toBe("completed");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("HttpVajraClient normalizes SQL nulls in listAnalyses items", async () => {
    const client = new HttpVajraClient("http://127.0.0.1:3000");
    const originalFetch = global.fetch;

    try {
      // Simulate server returning items with SQL null name/version
      global.fetch = async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                id: "analysis_1",
                name: null, // SQL NULL
                version: null,
                status: "queued",
                createdAt: "2026-11-01T00:00:00.000Z",
                findingCount: 0,
              },
            ],
            nextCursor: null,
          }),
        }) as any;

      const res = await client.listAnalyses();
      expect(res.items).toHaveLength(1);
      expect(res.items[0]!.name).toBeUndefined();
      expect(res.items[0]!.version).toBeUndefined();
      expect(res.items[0]!.status).toBe("queued");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
