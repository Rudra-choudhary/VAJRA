import { describe, it, expect } from "vitest";
import { join } from "node:path";
import type { AdapterContext } from "@vajra/contracts";
import { inspectUploadedArchive } from "./upload.js";

const FIXTURES_DIR = join(process.cwd(), "tests/fixtures/ingestion");

function mockContext(fileMap: Record<string, string>, signal?: AbortSignal): AdapterContext {
  return {
    signal: signal ?? new AbortController().signal,
    workspaceDir: "/tmp/test-workspace",
    limits: {
      maxEntries: 100,
      maxFindings: 1000,
      maxTextBytes: 512 * 1024,
      maxTotalTextBytes: 8 * 1024 * 1024,
      maxModelInputChars: 24000,
      maxModelFiles: 12,
      maxDiffChars: 64000,
      maxModelOutputBytes: 64000,
    },
    resolveUpload: async (id: string, _purpose: "package" | "source") => {
      const resolved = fileMap[id];
      if (!resolved) {
        throw new Error(`Upload not registered: ${id}`);
      }
      return resolved;
    },
  };
}

describe("inspectUploadedArchive", () => {
  it("inspects uploaded package archive and populates metadata and root", async () => {
    const context = mockContext({
      "upload-pkg-1": join(FIXTURES_DIR, "good.tgz"),
    });

    const snapshot = await inspectUploadedArchive(
      { uploadId: "upload-pkg-1", purpose: "package" },
      context,
    );

    expect(snapshot.root).toBe("package");
    expect(snapshot.metadata.name).toBe("demo");
    expect(snapshot.metadata.version).toBe("1.0.0");
    expect(snapshot.entries.length).toBe(2);

    const text = await snapshot.readText("package/package.json", 1024);
    expect(text.text).toContain('"demo"');
  });

  it("inspects uploaded source archive", async () => {
    const context = mockContext({
      "upload-src-1": join(FIXTURES_DIR, "good.tgz"),
    });

    const snapshot = await inspectUploadedArchive(
      { uploadId: "upload-src-1", purpose: "source" },
      context,
    );

    expect(snapshot.entries.length).toBe(2);
    expect(snapshot.repositoryUrl).toBeUndefined();
    expect(snapshot.commit).toBeUndefined();
  });

  it("throws UPLOAD_NOT_FOUND when file does not exist on disk (ENOENT)", async () => {
    const context = mockContext({
      "upload-missing": "/path/to/nonexistent/file.tgz",
    });

    await expect(
      inspectUploadedArchive({ uploadId: "upload-missing", purpose: "package" }, context),
    ).rejects.toMatchObject({
      code: "UPLOAD_NOT_FOUND",
    });
  });

  it("throws UNSAFE_ARCHIVE_ENTRY when path is a directory, not a regular file", async () => {
    const context = mockContext({
      "upload-dir": FIXTURES_DIR,
    });

    await expect(
      inspectUploadedArchive({ uploadId: "upload-dir", purpose: "package" }, context),
    ).rejects.toMatchObject({
      code: "UNSAFE_ARCHIVE_ENTRY",
    });
  });

  it("throws ARCHIVE_LIMIT_EXCEEDED when file size exceeds MAX_COMPRESSED_BYTES", async () => {
    const context = mockContext({
      "upload-oversized": join(FIXTURES_DIR, "oversized_entry.tgz"),
    });

    await expect(
      inspectUploadedArchive({ uploadId: "upload-oversized", purpose: "package" }, context),
    ).rejects.toMatchObject({
      code: "ARCHIVE_LIMIT_EXCEEDED",
    });
  });

  it("propagates AbortSignal cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const context = mockContext(
      { "upload-pkg-abort": join(FIXTURES_DIR, "good.tgz") },
      controller.signal,
    );

    await expect(
      inspectUploadedArchive({ uploadId: "upload-pkg-abort", purpose: "package" }, context),
    ).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
  });
});
