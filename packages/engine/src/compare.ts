import { createTwoFilesPatch } from "diff";
import type {
  ArtifactSnapshot,
  SourceSnapshot,
  FileDetail,
  FileSummary,
  Limits,
} from "@vajra/contracts";
import { ContentReader, stableId, within, EngineError } from "./snapshot.js";

export interface Comparison {
  details: FileDetail[];
  relocations: Map<string, string>;
}
export async function compare(
  artifact: ArtifactSnapshot,
  source: SourceSnapshot | null,
  sourceRoot: string,
  reader: ContentReader,
  limits: Limits,
): Promise<Comparison> {
  const pkg = new Map(
    artifact.entries.map((e) => {
      const p = within(e.path, artifact.root);
      if (p === null)
        throw new EngineError(
          "INVALID_SNAPSHOT",
          "Artifact entry lies outside the declared package root",
        );
      return [p, e];
    }),
  );
  const src = new Map(
    (source?.entries ?? []).flatMap((e) => {
      const p = within(e.path, sourceRoot);
      return p === null ? [] : [[p, e] as const];
    }),
  );
  const taken = new Set<string>();
  const pairs: Array<[string | undefined, string | undefined]> = [];
  const relocations = new Map<string, string>();
  for (const [path, e] of [...pkg].sort(([a], [b]) => a.localeCompare(b))) {
    let match: string | undefined = src.has(path) ? path : undefined;
    if (match === undefined) {
      const candidates = [...src].filter(
        ([p, s]) => !pkg.has(p) && !taken.has(p) && s.sha256 === e.sha256,
      );
      if (candidates.length === 1) match = candidates[0]![0];
    }
    if (match !== undefined) taken.add(match);
    pairs.push([path, match]);
  }
  for (const path of [...src.keys()].sort())
    if (!taken.has(path)) pairs.push([undefined, path]);
  const details: FileDetail[] = [];
  for (const [p, s] of pairs) {
    const pe = p === undefined ? undefined : pkg.get(p);
    const se = s === undefined ? undefined : src.get(s);
    const id = stableId("file", JSON.stringify([p, s]));
    const same =
      pe !== undefined && se !== undefined && pe.sha256 === se.sha256;
    const pc = pe
      ? await reader.read(artifact, pe.path)
      : { text: null, binary: false, truncated: false };
    const sc =
      se && source
        ? await reader.read(source, se.path)
        : { text: null, binary: false, truncated: false };
    const binary = pc.binary || sc.binary;
    const unavailable =
      (pe !== undefined && pc.text === null) ||
      (se !== undefined && sc.text === null);
    let truncated = pc.truncated || sc.truncated;
    const status: FileSummary["status"] = same
      ? "identical"
      : binary || unavailable || truncated
        ? "skipped"
        : pe
          ? se
            ? "modified"
            : "added"
          : "removed";
    let unifiedDiff = "";
    if (!same && !binary && !unavailable && !truncated) {
      // Bound diff work as well as output; large inputs remain inspectable but unclassified.
      if ((pc.text?.length ?? 0) + (sc.text?.length ?? 0) > limits.maxTextBytes)
        truncated = true;
      else {
        const patch = createTwoFilesPatch(
          s ?? "/dev/null",
          p ?? "/dev/null",
          sc.text ?? "",
          pc.text ?? "",
          "",
          "",
          { context: 3, timeout: 250 },
        );
        if (patch === undefined) truncated = true;
        else unifiedDiff = patch;
      }
      if (unifiedDiff.length > limits.maxDiffChars) {
        unifiedDiff = unifiedDiff.slice(0, limits.maxDiffChars);
        truncated = true;
      }
    }
    const file: FileSummary = {
      id,
      ...(p === undefined ? {} : { packagePath: p, packageHash: pe!.sha256 }),
      ...(s === undefined ? {} : { sourcePath: s, sourceHash: se!.sha256 }),
      status: !source || (truncated && !same) ? "skipped" : status,
      binary,
      truncated,
      findingIds: [],
    };
    if (p !== undefined && s !== undefined && p !== s)
      relocations.set(
        id,
        `Exact bytes match source file ${s} at a different path`,
      );
    details.push({
      file,
      packageText: pc.text,
      sourceText: sc.text,
      unifiedDiff,
      truncated,
    });
  }
  return { details, relocations };
}
