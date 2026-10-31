#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const api = (process.env.VAJRA_API_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const [command, ...args] = process.argv.slice(2);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}${path}`, init);
  const body = (await response.json().catch(() => null)) as any;
  if (!response.ok)
    throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
  return body as T;
}
async function upload(
  path: string,
  purpose: "package" | "source",
): Promise<string> {
  const form = new FormData();
  form.append("purpose", purpose);
  form.append(
    "file",
    new Blob([await readFile(path)]),
    path.split(/[\\/]/).pop() ?? "archive.tgz",
  );
  const result = await request<{ uploadId: string }>("/api/uploads", {
    method: "POST",
    body: form,
  });
  return result.uploadId;
}
function usage(): never {
  console.error(
    "Usage: vajra analyze (--name NAME --version VERSION | --package FILE) [--source FILE | --repository URL --commit SHA] | watch add|list|remove | monitor --once",
  );
  process.exit(2);
}

try {
  if (command === "analyze") {
    const { values } = parseArgs({
      args,
      options: {
        name: { type: "string" },
        version: { type: "string" },
        package: { type: "string" },
        source: { type: "string" },
        repository: { type: "string" },
        commit: { type: "string" },
      },
      strict: true,
    });
    const artifact = values.package
      ? { kind: "upload", uploadId: await upload(values.package, "package") }
      : values.name && values.version
        ? { kind: "npm", name: values.name, version: values.version }
        : usage();
    const source = values.source
      ? { kind: "upload", uploadId: await upload(values.source, "source") }
      : values.repository && values.commit
        ? {
            kind: "github",
            repositoryUrl: values.repository,
            commit: values.commit,
          }
        : values.repository || values.commit
          ? usage()
          : { kind: "auto" };
    const created = await request<{ id: string }>("/api/analyses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ artifact, source }),
    });
    let job: any;
    do {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      job = await request<any>(
        `/api/analyses/${encodeURIComponent(created.id)}`,
      );
      console.error(`${job.status}: ${job.stage}`);
    } while (["queued", "running"].includes(job.status));
    if (job.report) console.log(JSON.stringify(job.report, null, 2));
    else {
      console.error(job.error?.message ?? "Analysis failed");
      process.exitCode = 2;
    }
    if (job.status === "partial") process.exitCode = 2;
  } else if (command === "watch") {
    const [sub, value] = args;
    if (sub === "add" && value)
      console.log(
        JSON.stringify(
          await request("/api/watchlist", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: value }),
          }),
          null,
          2,
        ),
      );
    else if (sub === "list")
      console.log(JSON.stringify(await request("/api/watchlist"), null, 2));
    else if (sub === "remove" && value)
      await request(`/api/watchlist/${encodeURIComponent(value)}`, {
        method: "DELETE",
      });
    else usage();
  } else if (command === "monitor" && args.includes("--once")) {
    console.log(
      JSON.stringify(
        await request("/api/monitor/once", { method: "POST" }),
        null,
        2,
      ),
    );
  } else usage();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Command failed");
  process.exitCode = 2;
}
