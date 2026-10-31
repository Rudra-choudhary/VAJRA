import {
  NpmNameSchema,
  ExactVersionSchema,
  GithubUrlSchema,
  CommitSchema,
  PackageRootSchema,
  type AnalysisRequest,
} from "@vajra/contracts";

export interface FormValidationErrors {
  npmName?: string;
  npmVersion?: string;
  uploadPackageId?: string;
  githubUrl?: string;
  githubCommit?: string;
  packageRoot?: string;
  uploadSourceId?: string;
}

export function validateNpmName(name: string): string | undefined {
  if (!name.trim()) return "Package name is required.";
  const res = NpmNameSchema.safeParse(name.trim());
  if (!res.success) {
    return "Invalid npm package name. Must be lowercase, e.g. lodash or @scope/pkg.";
  }
  return undefined;
}

export function validateExactVersion(version: string): string | undefined {
  if (!version.trim()) return "Exact version is required.";
  const res = ExactVersionSchema.safeParse(version.trim());
  if (!res.success) {
    return "Must be an exact semver version (e.g. 1.0.0, 2.3.4-beta.1). Range operators (^, ~) are not allowed.";
  }
  return undefined;
}

export function validateGithubUrl(url: string): string | undefined {
  if (!url.trim()) return "GitHub repository URL is required.";
  try {
    const res = GithubUrlSchema.safeParse(url.trim());
    if (!res.success) {
      return "Must be an HTTPS github.com URL, e.g. https://github.com/owner/repo";
    }
  } catch {
    return "Must be an HTTPS github.com URL, e.g. https://github.com/owner/repo";
  }
  return undefined;
}

export function validateCommit(commit: string): string | undefined {
  if (!commit.trim()) return "Git commit hash is required.";
  const res = CommitSchema.safeParse(commit.trim());
  if (!res.success) {
    return "Must be a 40-character hexadecimal git commit SHA.";
  }
  return undefined;
}

export function validatePackageRoot(root: string): string | undefined {
  if (!root.trim()) return undefined; // Empty is valid
  const res = PackageRootSchema.safeParse(root.trim());
  if (!res.success) {
    return "Invalid package root. Must be a relative logical path without leading slash, e.g. packages/core";
  }
  return undefined;
}

export function buildAnalysisRequest(input: {
  artifactKind: "npm" | "upload";
  npmName: string;
  npmVersion: string;
  uploadPackageId: string;
  sourceKind: "auto" | "github" | "upload";
  githubUrl: string;
  githubCommit: string;
  packageRoot: string;
  uploadSourceId: string;
}): { request?: AnalysisRequest; errors: FormValidationErrors } {
  const errors: FormValidationErrors = {};

  let artifact: AnalysisRequest["artifact"];
  if (input.artifactKind === "npm") {
    const nameErr = validateNpmName(input.npmName);
    if (nameErr) errors.npmName = nameErr;
    const verErr = validateExactVersion(input.npmVersion);
    if (verErr) errors.npmVersion = verErr;
    artifact = {
      kind: "npm",
      name: input.npmName.trim(),
      version: input.npmVersion.trim(),
    };
  } else {
    if (!input.uploadPackageId.trim()) {
      errors.uploadPackageId = "Package archive upload is required.";
    }
    artifact = {
      kind: "upload",
      uploadId: input.uploadPackageId.trim(),
    };
  }

  let source: AnalysisRequest["source"];
  if (input.sourceKind === "auto") {
    source = { kind: "auto" };
  } else if (input.sourceKind === "github") {
    const urlErr = validateGithubUrl(input.githubUrl);
    if (urlErr) errors.githubUrl = urlErr;
    const commitErr = validateCommit(input.githubCommit);
    if (commitErr) errors.githubCommit = commitErr;
    const rootErr = validatePackageRoot(input.packageRoot);
    if (rootErr) errors.packageRoot = rootErr;

    source = {
      kind: "github",
      repositoryUrl: input.githubUrl.trim(),
      commit: input.githubCommit.trim(),
      packageRoot: input.packageRoot.trim()
        ? input.packageRoot.trim()
        : undefined,
    };
  } else {
    if (!input.uploadSourceId.trim()) {
      errors.uploadSourceId = "Source archive upload is required.";
    }
    const rootErr = validatePackageRoot(input.packageRoot);
    if (rootErr) errors.packageRoot = rootErr;

    source = {
      kind: "upload",
      uploadId: input.uploadSourceId.trim(),
      packageRoot: input.packageRoot.trim()
        ? input.packageRoot.trim()
        : undefined,
    };
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return { request: { artifact, source }, errors: {} };
}
