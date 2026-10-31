import { it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import {
  AnalysisJobSchema,
  AnalysisReportSchema,
  EvidenceRefSchema,
  LogicalPathSchema,
  IngestionErrorCodeSchema,
} from "./index.js";
import { resolve } from "node:path";
it("requires paired evidence line ranges", () => {
  expect(
    EvidenceRefSchema.safeParse({ fileId: "f", side: "source", startLine: 1 })
      .success,
  ).toBe(false);
  expect(
    EvidenceRefSchema.safeParse({
      fileId: "f",
      side: "source",
      startLine: 4,
      endLine: 2,
    }).success,
  ).toBe(false);
});
it("does not accept completed jobs without reports", () => {
  expect(
    AnalysisJobSchema.safeParse({ id: "x", status: "completed", stage: "done" })
      .success,
  ).toBe(false);
});
it("requires actionable failed job errors", () => {
  expect(
    AnalysisJobSchema.safeParse({
      id: "x",
      status: "failed",
      stage: "retrieving",
    }).success,
  ).toBe(false);
});
it.each(["a//b", "a\u0000b", "C:/file", "./file", "../file"])(
  "rejects unsafe logical path %s",
  (p) => {
    expect(LogicalPathSchema.safeParse(p).success).toBe(false);
  },
);
it.each(["clean", "suspicious", "partial", "failed"])(
  "validates the %s shared UI fixture",
  async (name) => {
    const path = resolve("packages/contracts/fixtures", `${name}.json`);
    const fixture: unknown = JSON.parse(await readFile(path, "utf8"));
    expect(fixture).toMatchObject({ fixture: true });
    const value = fixture as { job: unknown };
    expect(() => AnalysisJobSchema.parse(value.job)).not.toThrow();
    const job = value.job as { report?: unknown };
    if (job.report !== undefined)
      expect(() => AnalysisReportSchema.parse(job.report)).not.toThrow();
  },
);
it("publishes stable ingestion error codes", () => {
  for (const code of [
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
  ])
    expect(IngestionErrorCodeSchema.parse(code)).toBe(code);
});
