import { describe, it, expect } from "vitest";
import { renderMarkdown, renderJson } from "../packages/reports/src/index.js";
import { createStorage } from "../packages/storage/src/index.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("reports", () => {
  it("renders markdown", () => {
    const r = { id: "a", status: "completed", createdAt: new Date().toISOString(), request: { artifact: { kind: "npm", name: "x", version: "1.0.0" }, source: { kind: "auto" } }, artifact: { sha256: "0".repeat(64) }, source: { method: "m", confidence: "high", evidence: [], limitations: [] }, coverage: { totalFiles: 0, comparedFiles: 0, skippedFiles: 0, reasons: [] }, files: [], findings: [], model: { id: null, status: "not_configured" }, toolVersion: "0.1.0", rulesVersion: "1", durationMs: 0 } as any;
    expect(renderMarkdown(r)).toContain("Vajra Analysis Report");
    expect(JSON.parse(renderJson(r)).id).toBe("a");
  });
});

describe("storage", () => {
  it("round trips job", () => {
    const dir = mkdtempSync(join(tmpdir(), "v-"));
    const s = createStorage(join(dir, "db.sqlite"));
    const job = { id: "j1", status: "queued", stage: "queued" } as any;
    s.saveJob(job);
    expect(s.getJob("j1")?.id).toBe("j1");
    s.close();
  });
});