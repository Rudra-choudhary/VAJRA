import { describe, it, expect } from "vitest";
import type { AdapterContext } from "@vajra/contracts";
import { createIngestionAdapter } from "./index.js";

function mockContext(): AdapterContext {
  return {
    signal: new AbortController().signal,
    workspaceDir: "/tmp/workspace",
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
    resolveUpload: async () => "/unused",
  };
}

describe("createIngestionAdapter", () => {
  it("returns all four required IngestionAdapter methods", () => {
    const adapter = createIngestionAdapter();
    expect(typeof adapter.fetchNpmArtifact).toBe("function");
    expect(typeof adapter.fetchGithubSnapshot).toBe("function");
    expect(typeof adapter.inspectUploadedArchive).toBe("function");
    expect(typeof adapter.resolveGithubRef).toBe("function");
  });

  it("fetches exact GitHub refs and reports missing resources", async () => {
    const adapter = createIngestionAdapter({
      fetch: async () => new Response(null, { status: 404 }),
    });
    const context = mockContext();

    await expect(
      adapter.fetchGithubSnapshot(
        {
          repositoryUrl: "https://github.com/example/repo",
          commit: "a".repeat(40),
        },
        context,
      ),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    await expect(
      adapter.resolveGithubRef!(
        { repositoryUrl: "https://github.com/example/repo", ref: "v1.0.0" },
        context,
      ),
    ).resolves.toBeNull();
  });
});
