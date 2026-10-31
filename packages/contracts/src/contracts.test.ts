import { it, expect } from "vitest";
import {
  AnalysisJobSchema,
  EvidenceRefSchema,
  LogicalPathSchema,
} from "./index.js";
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
