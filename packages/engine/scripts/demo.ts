import { mkdir, writeFile } from "node:fs/promises";
import { analyze } from "../src/index.js";
import { dependencies, request } from "../src/testing.js";
const out = new URL("../../contracts/fixtures/", import.meta.url);
await mkdir(out, { recursive: true });
for (const [name, tampered, model] of [
  ["clean", false, true],
  ["suspicious", true, true],
  ["partial", true, false],
] as const) {
  const deps = dependencies(tampered);
  deps.analysisId = "fixture_" + name;
  deps.now = () => new Date("2026-10-31T00:00:00Z");
  if (!model) delete deps.model;
  const report = await analyze(request, deps);
  report.durationMs = 0;
  await writeFile(
    new URL(name + ".json", out),
    JSON.stringify(
      {
        fixture: true,
        description:
          "Synthetic development fixture; not a real model assessment.",
        job: { id: report.id, status: report.status, stage: "done", report },
        details: deps.details,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`${name}: ${report.findings.length} findings, ${report.status}`);
}
await writeFile(
  new URL("failed.json", out),
  JSON.stringify(
    {
      fixture: true,
      job: {
        id: "fixture_failed",
        status: "failed",
        stage: "retrieving",
        error: {
          code: "NETWORK_ERROR",
          message: "Development fixture: registry unavailable",
          retryable: true,
        },
      },
    },
    null,
    2,
  ) + "\n",
);
