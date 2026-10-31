import {
  AnalysisJobSchema,
  FileDetailSchema,
  type AnalysisJob,
  type FileDetail,
} from "@vajra/contracts";

// We import the synthetic contract fixtures authored by Rudra
import cleanFixtureJson from "../../../../../packages/contracts/fixtures/clean.json";
import suspiciousFixtureJson from "../../../../../packages/contracts/fixtures/suspicious.json";
import partialFixtureJson from "../../../../../packages/contracts/fixtures/partial.json";
import failedFixtureJson from "../../../../../packages/contracts/fixtures/failed.json";

export interface FixturePackage {
  id: string;
  name: string;
  label: string;
  description: string;
  job: AnalysisJob;
  details: FileDetail[];
}

function parseFixture(
  id: string,
  label: string,
  raw: {
    description?: string;
    job: unknown;
    details?: unknown[];
  },
): FixturePackage {
  const job = AnalysisJobSchema.parse(raw.job);
  const details = (raw.details ?? []).map((d) => FileDetailSchema.parse(d));
  const pkgName =
    (job.report?.artifact.name ?? job.report?.request.artifact.kind === "npm")
      ? (job.report?.request.artifact as { name: string }).name
      : id;

  return {
    id,
    name: pkgName,
    label,
    description:
      raw.description ??
      "Synthetic development fixture; not a real model assessment.",
    job,
    details,
  };
}

export const FIXTURE_IDS = [
  "clean",
  "suspicious",
  "partial",
  "failed",
] as const;
export type FixtureId = (typeof FIXTURE_IDS)[number];

export const FIXTURES: Record<FixtureId, FixturePackage> = {
  clean: parseFixture(
    "clean",
    "Clean Package (Packaging Diffs)",
    cleanFixtureJson as any,
  ),
  suspicious: parseFixture(
    "suspicious",
    "Suspicious Package (Injected Code/Script)",
    suspiciousFixtureJson as any,
  ),
  partial: parseFixture(
    "partial",
    "Partial Analysis (Unconfigured Model)",
    partialFixtureJson as any,
  ),
  failed: parseFixture(
    "failed",
    "Failed Job (Recoverable Network Error)",
    failedFixtureJson as any,
  ),
};
