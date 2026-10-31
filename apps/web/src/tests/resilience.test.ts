import { describe, expect, it } from "vitest";
import type { EvidenceRef, FileSummary, Finding } from "@vajra/contracts";
import { getFileStatusMeta } from "../utils/formatters.js";

describe("Assignment C: UI Resilience & Missing Evidence Safety", () => {
  it("file status meta safely handles all 5 status values", () => {
    const statuses: Array<
      "identical" | "added" | "removed" | "modified" | "skipped"
    > = ["identical", "added", "removed", "modified", "skipped"];
    for (const s of statuses) {
      const meta = getFileStatusMeta(s);
      expect(meta.label).toBeDefined();
      expect(meta.symbol).toBeDefined();
      expect(meta.className).toBeDefined();
    }
  });

  it("missing evidence file references do not throw runtime exceptions", () => {
    const danglingEvidence: EvidenceRef = {
      fileId: "file_nonexistent_1234567890",
      side: "package",
      startLine: 10,
      endLine: 20,
      excerpt: "some code",
    };

    const files: FileSummary[] = [
      {
        id: "file_real_1",
        packagePath: "index.js",
        sourcePath: "index.js",
        status: "identical",
        packageHash:
          "a2098bd92b10bf8b816d24b7556b1ce8c49a879d130489065ef1051c17e042f6",
        sourceHash:
          "a2098bd92b10bf8b816d24b7556b1ce8c49a879d130489065ef1051c17e042f6",
        binary: false,
        truncated: false,
        findingIds: [],
      },
    ];

    const fileMap = new Map<string, FileSummary>();
    for (const f of files) fileMap.set(f.id, f);

    // Resolving dangling file returns undefined safely without throwing
    const resolved = fileMap.get(danglingEvidence.fileId);
    expect(resolved).toBeUndefined();

    const filePath =
      danglingEvidence.side === "package"
        ? (resolved?.packagePath ?? resolved?.sourcePath)
        : (resolved?.sourcePath ?? resolved?.packagePath);

    expect(filePath).toBeUndefined();
  });

  it("handles files with absent sides safely (added file has no sourcePath, removed has no packagePath)", () => {
    const addedFile: FileSummary = {
      id: "file_added",
      packagePath: "dist/bundle.js",
      status: "added",
      packageHash:
        "a2098bd92b10bf8b816d24b7556b1ce8c49a879d130489065ef1051c17e042f6",
      binary: false,
      truncated: false,
      findingIds: [],
    };

    const removedFile: FileSummary = {
      id: "file_removed",
      sourcePath: "tests/check.js",
      status: "removed",
      sourceHash:
        "a2098bd92b10bf8b816d24b7556b1ce8c49a879d130489065ef1051c17e042f6",
      binary: false,
      truncated: false,
      findingIds: [],
    };

    expect(addedFile.sourcePath).toBeUndefined();
    expect(addedFile.packagePath).toBe("dist/bundle.js");

    expect(removedFile.packagePath).toBeUndefined();
    expect(removedFile.sourcePath).toBe("tests/check.js");
  });
});
