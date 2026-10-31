import {
  CommitSchema,
  GithubUrlSchema,
  PackageRootSchema,
  type AnalysisRequest,
  type ArtifactSnapshot,
  type SourceSnapshot,
  type SourceResolution,
  type AdapterContext,
  type IngestionAdapter,
} from "@vajra/contracts";
import {
  ContentReader,
  checkSnapshot,
  within,
  EngineError,
} from "./snapshot.js";
export interface ResolvedSource {
  snapshot: SourceSnapshot | null;
  resolution: SourceResolution;
}
function github(value: string): string | null {
  let u = value
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/\/$/, "")
    .replace(/\.git$/, "");
  if (u.startsWith("github:")) u = "https://github.com/" + u.slice(7);
  if (/^[\w.-]+\/[\w.-]+$/.test(u)) u = "https://github.com/" + u;
  return GithubUrlSchema.safeParse(u).success ? u.toLowerCase() : null;
}
async function packageRoot(
  snapshot: SourceSnapshot,
  artifact: ArtifactSnapshot,
  explicit: string | undefined,
  reader: ContentReader,
): Promise<string> {
  if (explicit !== undefined) {
    PackageRootSchema.parse(explicit);
    const m = await reader.manifest(
      snapshot,
      explicit ? explicit + "/package.json" : "package.json",
    );
    if (!m)
      throw new EngineError(
        "SOURCE_ROOT_MISMATCH",
        "Explicit source root has no readable package.json",
      );
    if (artifact.metadata.name && m.name !== artifact.metadata.name)
      throw new EngineError(
        "SOURCE_ROOT_MISMATCH",
        "Source package name differs from the artifact",
      );
    return explicit;
  }
  const manifests = snapshot.entries.filter(
    (e) => e.path === "package.json" || e.path.endsWith("/package.json"),
  );
  if (manifests.length > 100)
    throw new EngineError(
      "SOURCE_ROOT_AMBIGUOUS",
      "Too many package roots; specify a packageRoot",
    );
  const matches: string[] = [];
  for (const entry of manifests) {
    const m = await reader.manifest(snapshot, entry.path);
    if (m && artifact.metadata.name && m.name === artifact.metadata.name)
      matches.push(
        entry.path === "package.json" ? "" : entry.path.slice(0, -13),
      );
  }
  if (matches.length !== 1)
    throw new EngineError(
      "SOURCE_ROOT_AMBIGUOUS",
      "Could not identify exactly one matching source package; specify a packageRoot",
    );
  return matches[0]!;
}
export async function resolveSource(
  request: AnalysisRequest,
  artifact: ArtifactSnapshot,
  adapter: IngestionAdapter,
  context: AdapterContext,
  reader: ContentReader,
): Promise<ResolvedSource> {
  let snapshot: SourceSnapshot | null = null;
  const resolution: SourceResolution = {
    method: "unresolved",
    confidence: "low",
    evidence: [],
    limitations: [],
  };
  try {
    let root: string | undefined;
    if (request.source.kind === "upload") {
      snapshot = await adapter.inspectUploadedArchive(
        { uploadId: request.source.uploadId, purpose: "source" },
        context,
      );
      resolution.method = "user_source_snapshot";
      resolution.confidence = "medium";
      root = request.source.packageRoot;
      resolution.evidence.push("User supplied an explicit source archive");
      resolution.limitations.push(
        "User-supplied source is a comparison baseline, not authenticated release provenance",
      );
    } else {
      let repositoryUrl: string, commit: string;
      if (request.source.kind === "github") {
        repositoryUrl = request.source.repositoryUrl;
        commit = request.source.commit.toLowerCase();
        root = request.source.packageRoot;
        resolution.method = "user_commit";
        resolution.confidence = "high";
        resolution.evidence.push("User selected an immutable source commit");
      } else {
        const repo = artifact.metadata.repository;
        const url = repo ? github(repo.url) : null;
        if (!url)
          throw new EngineError(
            "SOURCE_UNRESOLVED",
            "No supported GitHub repository in release metadata",
          );
        repositoryUrl = url;
        root = repo?.directory;
        if (
          artifact.metadata.gitHead &&
          CommitSchema.safeParse(artifact.metadata.gitHead).success
        ) {
          commit = artifact.metadata.gitHead.toLowerCase();
          resolution.method = "release_git_head";
          resolution.confidence = "medium";
          resolution.evidence.push(
            "Release metadata supplies gitHead " + commit,
          );
          resolution.limitations.push(
            "Publisher-provided gitHead is not a verified provenance attestation",
          );
        } else {
          if (!adapter.resolveGithubRef || !artifact.metadata.version)
            throw new EngineError(
              "SOURCE_UNRESOLVED",
              "No gitHead or tag resolver available; provide an exact source commit",
            );
          const v = artifact.metadata.version;
          const name = artifact.metadata.name;
          const tags = [`v${v}`, v, ...(name ? [`${name}@${v}`] : [])];
          const candidates = new Map<string, string[]>();
          for (const ref of tags) {
            context.signal.throwIfAborted();
            const sha = await adapter.resolveGithubRef(
              { repositoryUrl, ref },
              context,
            );
            if (sha) {
              CommitSchema.parse(sha);
              const key = sha.toLowerCase();
              candidates.set(key, [...(candidates.get(key) ?? []), ref]);
            }
          }
          if (candidates.size !== 1)
            throw new EngineError(
              "SOURCE_UNRESOLVED",
              candidates.size
                ? "Release tags disagree; provide an exact commit"
                : "No release tag resolves; provide an exact commit",
            );
          const candidate = [...candidates.entries()][0]!;
          commit = candidate[0];
          resolution.method = "release_tag_candidate";
          resolution.confidence = "low";
          resolution.evidence.push(
            "Candidate tags: " + candidate[1].join(", "),
          );
          resolution.limitations.push(
            "Tag-based source identity is tentative and not authenticated provenance",
          );
        }
      }
      snapshot = await adapter.fetchGithubSnapshot(
        { repositoryUrl, commit },
        context,
      );
      if (snapshot.commit?.toLowerCase() !== commit)
        throw new EngineError(
          "SOURCE_IDENTITY_MISMATCH",
          "Fetched source did not confirm the requested commit",
        );
      if (
        snapshot.repositoryUrl &&
        github(snapshot.repositoryUrl) !== github(repositoryUrl)
      )
        throw new EngineError(
          "SOURCE_IDENTITY_MISMATCH",
          "Fetched source repository differs from the request",
        );
      resolution.repositoryUrl = repositoryUrl;
      resolution.commit = commit;
    }
    checkSnapshot(snapshot, context.limits);
    const chosen = await packageRoot(snapshot, artifact, root, reader);
    if (!snapshot.entries.some((e) => within(e.path, chosen) !== null))
      throw new EngineError(
        "SOURCE_ROOT_MISMATCH",
        "Selected source root is empty",
      );
    const sourceManifest = await reader.manifest(
      snapshot,
      chosen ? chosen + "/package.json" : "package.json",
    );
    if (
      artifact.metadata.version &&
      sourceManifest?.version !== artifact.metadata.version
    ) {
      resolution.confidence = "low";
      resolution.limitations.push(
        "Source manifest version differs from the published package; release-time versioning or wrong source may explain this",
      );
    }
    resolution.packageRoot = chosen;
    resolution.snapshotSha256 = snapshot.sha256;
    resolution.evidence.push("Source package root: " + (chosen || "."));
    return { snapshot, resolution };
  } catch (error) {
    context.signal.throwIfAborted();
    resolution.method = "unresolved";
    resolution.confidence = "low";
    resolution.limitations.push(
      error instanceof EngineError
        ? error.message
        : "Source retrieval or validation failed; provide a validated source override",
    );
    return { snapshot: null, resolution };
  }
}
