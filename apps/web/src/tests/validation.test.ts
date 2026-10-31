import { describe, expect, it } from "vitest";
import {
  buildAnalysisRequest,
  validateCommit,
  validateExactVersion,
  validateGithubUrl,
  validateNpmName,
  validatePackageRoot,
} from "../utils/validation.js";

describe("Assignment C: Form & Input Validation", () => {
  it("accepts valid unscoped and scoped npm package names", () => {
    expect(validateNpmName("lodash")).toBeUndefined();
    expect(validateNpmName("express")).toBeUndefined();
    expect(validateNpmName("@angular/core")).toBeUndefined();
    expect(validateNpmName("@vajra/contracts")).toBeUndefined();
  });

  it("rejects invalid npm package names", () => {
    expect(validateNpmName("")).toBeDefined();
    expect(validateNpmName("   ")).toBeDefined();
    expect(validateNpmName("Lodash")).toBeDefined(); // uppercase
    expect(validateNpmName("has space")).toBeDefined();
    expect(validateNpmName("../traversal")).toBeDefined();
  });

  it("enforces exact semver version without ranges", () => {
    expect(validateExactVersion("1.0.0")).toBeUndefined();
    expect(validateExactVersion("4.17.21")).toBeUndefined();
    expect(validateExactVersion("2.0.0-beta.1")).toBeUndefined();

    expect(validateExactVersion("^1.0.0")).toBeDefined();
    expect(validateExactVersion("~1.0.0")).toBeDefined();
    expect(validateExactVersion(">=1.0.0")).toBeDefined();
    expect(validateExactVersion("latest")).toBeDefined();
    expect(validateExactVersion("")).toBeDefined();
  });

  it("validates github repository URLs strictly", () => {
    expect(validateGithubUrl("https://github.com/owner/repo")).toBeUndefined();
    expect(
      validateGithubUrl("https://github.com/lodash/lodash.git"),
    ).toBeUndefined();

    expect(validateGithubUrl("http://github.com/owner/repo")).toBeDefined(); // no http
    expect(validateGithubUrl("https://gitlab.com/owner/repo")).toBeDefined();
    expect(
      validateGithubUrl("https://github.com/owner/repo?token=secret"),
    ).toBeDefined();
    expect(validateGithubUrl("")).toBeDefined();
  });

  it("validates 40-character hexadecimal git commit SHAs", () => {
    expect(
      validateCommit("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    ).toBeUndefined();
    expect(
      validateCommit("0123456789abcdef0123456789abcdef01234567"),
    ).toBeUndefined();

    expect(validateCommit("main")).toBeDefined();
    expect(validateCommit("v1.0.0")).toBeDefined();
    expect(validateCommit("shortsha")).toBeDefined();
    expect(
      validateCommit("0123456789abcdef0123456789abcdef0123456z"),
    ).toBeDefined(); // non-hex
  });

  it("validates safe package roots", () => {
    expect(validatePackageRoot("")).toBeUndefined();
    expect(validatePackageRoot("packages/core")).toBeUndefined();
    expect(validatePackageRoot("/leading/slash")).toBeDefined();
    expect(validatePackageRoot("with/../traversal")).toBeDefined();
  });

  it("builds valid AnalysisRequest for npm + github inputs", () => {
    const res = buildAnalysisRequest({
      artifactKind: "npm",
      npmName: "demo-package",
      npmVersion: "1.0.0",
      uploadPackageId: "",
      sourceKind: "github",
      githubUrl: "https://github.com/example/demo-package",
      githubCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      packageRoot: "",
      uploadSourceId: "",
    });

    expect(Object.keys(res.errors)).toHaveLength(0);
    expect(res.request).toBeDefined();
    expect(res.request?.artifact).toEqual({
      kind: "npm",
      name: "demo-package",
      version: "1.0.0",
    });
    expect(res.request?.source).toEqual({
      kind: "github",
      repositoryUrl: "https://github.com/example/demo-package",
      commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      packageRoot: undefined,
    });
  });

  it("returns distinct field errors when multiple fields are invalid", () => {
    const res = buildAnalysisRequest({
      artifactKind: "npm",
      npmName: "INVALID NAME",
      npmVersion: "^1.0",
      uploadPackageId: "",
      sourceKind: "github",
      githubUrl: "invalid-url",
      githubCommit: "bad",
      packageRoot: "",
      uploadSourceId: "",
    });

    expect(res.request).toBeUndefined();
    expect(res.errors.npmName).toBeDefined();
    expect(res.errors.npmVersion).toBeDefined();
    expect(res.errors.githubUrl).toBeDefined();
    expect(res.errors.githubCommit).toBeDefined();
  });
});
