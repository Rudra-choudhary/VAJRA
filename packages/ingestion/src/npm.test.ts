import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AdapterContext } from "@vajra/contracts";
import { fetchNpmArtifact, encodePackageName } from "./npm.js";

const FIXTURES_DIR = join(process.cwd(), "tests/fixtures/ingestion");
const goodTgzBuffer = readFileSync(join(FIXTURES_DIR, "good.tgz"));
const goodIntegrity =
  "sha512-" + createHash("sha512").update(goodTgzBuffer).digest("base64");

function mockContext(signal?: AbortSignal): AdapterContext {
  return {
    signal: signal ?? new AbortController().signal,
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

describe("encodePackageName", () => {
  it("encodes scoped and unscoped package names", () => {
    expect(encodePackageName("express")).toBe("express");
    expect(encodePackageName("@types/node")).toBe("%40types%2fnode");
    expect(encodePackageName("@vajra/contracts")).toBe("%40vajra%2fcontracts");
  });
});

describe("fetchNpmArtifact", () => {
  it("fetches and verifies a valid npm artifact with SRI integrity", async () => {
    const mockFetcher = vi.fn(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("registry.npmjs.org/demo/1.0.0")) {
        return new Response(
          JSON.stringify({
            name: "demo",
            version: "1.0.0",
            dist: {
              tarball: "https://registry.npmjs.org/demo/-/demo-1.0.0.tgz",
              integrity: goodIntegrity,
            },
            gitHead: "a".repeat(40),
            repository: { url: "https://github.com/example/demo" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (urlStr === "https://registry.npmjs.org/demo/-/demo-1.0.0.tgz") {
        return new Response(goodTgzBuffer, {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
        });
      }
      return new Response("Not Found", { status: 404 });
    });

    const context = mockContext();
    const snapshot = await fetchNpmArtifact(
      { kind: "npm", name: "demo", version: "1.0.0" },
      context,
      { fetch: mockFetcher as unknown as typeof fetch },
    );

    expect(snapshot.root).toBe("package");
    expect(snapshot.metadata.name).toBe("demo");
    expect(snapshot.metadata.version).toBe("1.0.0");
    expect(snapshot.metadata.gitHead).toBe("a".repeat(40));
    expect(snapshot.metadata.repository?.url).toBe("https://github.com/example/demo");
    expect(snapshot.entries.length).toBe(2);
  });

  it("rejects non-exact versions (ranges/tags)", async () => {
    const context = mockContext();
    await expect(
      fetchNpmArtifact(
        { kind: "npm", name: "demo", version: "^1.0.0" },
        context,
      ),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });

    await expect(
      fetchNpmArtifact(
        { kind: "npm", name: "demo", version: "latest" },
        context,
      ),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });

  it("rejects if dist.integrity is missing", async () => {
    const mockFetcher = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          name: "demo",
          version: "1.0.0",
          dist: {
            tarball: "https://registry.npmjs.org/demo/-/demo-1.0.0.tgz",
            shasum: "some-old-sha1",
            // missing integrity
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const context = mockContext();
    await expect(
      fetchNpmArtifact(
        { kind: "npm", name: "demo", version: "1.0.0" },
        context,
        { fetch: mockFetcher as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({
      code: "INTEGRITY_MISMATCH",
    });
  });

  it("rejects if downloaded tarball sha512 does not match dist.integrity", async () => {
    const mockFetcher = vi.fn(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("registry.npmjs.org/demo/1.0.0")) {
        return new Response(
          JSON.stringify({
            name: "demo",
            version: "1.0.0",
            dist: {
              tarball: "https://registry.npmjs.org/demo/-/demo-1.0.0.tgz",
              integrity: "sha512-wrongintegritybase64here==",
            },
          }),
          { status: 200 },
        );
      }
      return new Response(goodTgzBuffer, { status: 200 });
    });

    const context = mockContext();
    await expect(
      fetchNpmArtifact(
        { kind: "npm", name: "demo", version: "1.0.0" },
        context,
        { fetch: mockFetcher as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({
      code: "INTEGRITY_MISMATCH",
    });
  });

  it("rejects if extracted package.json name or version does not match request", async () => {
    // goodTgzBuffer contains name: "demo", version: "1.0.0"
    const mockFetcher = vi.fn(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("registry.npmjs.org/spoofed/1.0.0")) {
        return new Response(
          JSON.stringify({
            name: "spoofed",
            version: "1.0.0",
            dist: {
              tarball: "https://registry.npmjs.org/spoofed/-/spoofed-1.0.0.tgz",
              integrity: goodIntegrity,
            },
          }),
          { status: 200 },
        );
      }
      return new Response(goodTgzBuffer, { status: 200 });
    });

    const context = mockContext();
    await expect(
      fetchNpmArtifact(
        { kind: "npm", name: "spoofed", version: "1.0.0" },
        context,
        { fetch: mockFetcher as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({
      code: "INTEGRITY_MISMATCH",
    });
  });

  it("rejects off-host redirects with UNSUPPORTED_HOST", async () => {
    const mockFetcher = vi.fn(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("registry.npmjs.org/demo/1.0.0")) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://attacker.com/evil.json" },
        });
      }
      return new Response("Not Found", { status: 404 });
    });

    const context = mockContext();
    await expect(
      fetchNpmArtifact(
        { kind: "npm", name: "demo", version: "1.0.0" },
        context,
        { fetch: mockFetcher as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_HOST",
    });
  });

  it("rejects redirect loops exceeding MAX_REDIRECTS (3)", async () => {
    let hop = 0;
    const mockFetcher = vi.fn(async () => {
      hop++;
      return new Response(null, {
        status: 302,
        headers: { location: `https://registry.npmjs.org/loop-${hop}` },
      });
    });

    const context = mockContext();
    await expect(
      fetchNpmArtifact(
        { kind: "npm", name: "demo", version: "1.0.0" },
        context,
        { fetch: mockFetcher as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({
      code: "HTTP_ERROR",
    });
  });

  it("maps timeout to NETWORK_TIMEOUT", async () => {
    const controller = new AbortController();
    const mockFetcher = vi.fn(async () => {
      controller.abort();
      throw new Error("aborted");
    });

    const context = mockContext(controller.signal);
    await expect(
      fetchNpmArtifact(
        { kind: "npm", name: "demo", version: "1.0.0" },
        context,
        { fetch: mockFetcher as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({
      code: "NETWORK_TIMEOUT",
    });
  });

  it("rejects oversized response payload with ARCHIVE_LIMIT_EXCEEDED", async () => {
    const oversizedStream = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(new Uint8Array(26 * 1024 * 1024));
        ctrl.close();
      },
    });

    const mockFetcherOversized = vi.fn(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("registry.npmjs.org/demo/1.0.0")) {
        return new Response(
          JSON.stringify({
            name: "demo",
            version: "1.0.0",
            dist: {
              tarball: "https://registry.npmjs.org/demo/-/demo-1.0.0.tgz",
              integrity: goodIntegrity,
            },
          }),
          { status: 200 },
        );
      }
      return new Response(oversizedStream, { status: 200 });
    });

    const context = mockContext();
    await expect(
      fetchNpmArtifact(
        { kind: "npm", name: "demo", version: "1.0.0" },
        context,
        { fetch: mockFetcherOversized as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({
      code: "ARCHIVE_LIMIT_EXCEEDED",
    });
  });
});
