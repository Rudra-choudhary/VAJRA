import { mkdir, writeFile } from "node:fs/promises";
import { analyze, createOllamaClient } from "../src/index.js";
import { dependencies, request } from "../src/testing.js";
const id = process.env.VAJRA_MODEL;
if (!id) throw new Error("Set VAJRA_MODEL to an installed Ollama model");
const deps = dependencies();
deps.analysisId = "live_model_smoke";
deps.model = createOllamaClient({
  model: id,
  baseUrl: process.env.VAJRA_OLLAMA_URL ?? "http://127.0.0.1:11434",
  timeoutMs: 120000,
});
deps.modelTimeoutMs = 125000;
// Small, representative subset for comparable local inference timing.
deps.limits = { maxModelFiles: 2, maxModelInputChars: 12000 };
const report = await analyze(request, deps, (stage) => console.log(stage));
await mkdir(".vajra", { recursive: true });
await writeFile(
  ".vajra/model-" + id.replace(/[^\w-]/g, "_") + ".json",
  JSON.stringify(
    {
      input:
        "controlled injection fixture; synthetic package, actual model response",
      report,
      details: deps.details,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    {
      model: report.model,
      durationMs: Math.round(report.durationMs),
      findings: report.findings.length,
      explained: report.findings.filter((f) => f.origin === "combined").length,
      limitations: report.coverage.reasons,
    },
    null,
    2,
  ),
);
if (report.model.status !== "used") process.exitCode = 1;
