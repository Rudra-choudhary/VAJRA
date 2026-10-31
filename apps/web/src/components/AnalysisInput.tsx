import React, { useState } from "react";
import type { AnalysisRequest } from "@vajra/contracts";
import type { VajraTransport } from "../api/transport.js";
import {
  buildAnalysisRequest,
  type FormValidationErrors,
} from "../utils/validation.js";
import { Button } from "./Common.js";
import type { FixtureId } from "../api/fixtures/index.js";

export interface AnalysisInputProps {
  transport: VajraTransport;
  onSubmit: (request: AnalysisRequest) => Promise<void>;
  isSubmitting: boolean;
  onSelectFixture?: (id: FixtureId) => void;
}

export const AnalysisInput: React.FC<AnalysisInputProps> = ({
  transport,
  onSubmit,
  isSubmitting,
  onSelectFixture,
}) => {
  const [artifactKind, setArtifactKind] = useState<"npm" | "upload">("npm");
  const [npmName, setNpmName] = useState("demo-package");
  const [npmVersion, setNpmVersion] = useState("1.0.0");
  const [packageFile, setPackageFile] = useState<File | null>(null);
  const [uploadPackageId, setUploadPackageId] = useState("");
  const [isUploadingPackage, setIsUploadingPackage] = useState(false);

  const [sourceKind, setSourceKind] = useState<"auto" | "github" | "upload">(
    "github",
  );
  const [githubUrl, setGithubUrl] = useState(
    "https://github.com/example/demo-package",
  );
  const [githubCommit, setGithubCommit] = useState(
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  );
  const [packageRoot, setPackageRoot] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [uploadSourceId, setUploadSourceId] = useState("");
  const [isUploadingSource, setIsUploadingSource] = useState(false);

  const [errors, setErrors] = useState<FormValidationErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handlePackageFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPackageFile(file);
    setIsUploadingPackage(true);
    setErrors((prev) => ({ ...prev, uploadPackageId: undefined }));
    try {
      const res = await transport.uploadFile(file, "package");
      setUploadPackageId(res.uploadId);
    } catch (err: any) {
      setErrors((prev) => ({
        ...prev,
        uploadPackageId: err.message || "Failed to upload package archive.",
      }));
    } finally {
      setIsUploadingPackage(false);
    }
  };

  const handleSourceFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSourceFile(file);
    setIsUploadingSource(true);
    setErrors((prev) => ({ ...prev, uploadSourceId: undefined }));
    try {
      const res = await transport.uploadFile(file, "source");
      setUploadSourceId(res.uploadId);
    } catch (err: any) {
      setErrors((prev) => ({
        ...prev,
        uploadSourceId: err.message || "Failed to upload source archive.",
      }));
    } finally {
      setIsUploadingSource(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const { request, errors: validationErrors } = buildAnalysisRequest({
      artifactKind,
      npmName,
      npmVersion,
      uploadPackageId,
      sourceKind,
      githubUrl,
      githubCommit,
      packageRoot,
      uploadSourceId,
    });

    if (validationErrors && Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    if (!request) return;

    setErrors({});
    try {
      await onSubmit(request);
    } catch (err: any) {
      setSubmitError(err.message || "Failed to submit analysis request.");
    }
  };

  const loadPreset = (
    preset: "clean" | "suspicious" | "partial" | "failed",
  ) => {
    setArtifactKind("npm");
    setNpmName("demo-package");
    setNpmVersion("1.0.0");
    setSourceKind("github");
    setGithubUrl("https://github.com/example/demo-package");
    setGithubCommit("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    setPackageRoot("");
    setErrors({});
    setSubmitError(null);

    if (onSelectFixture) {
      onSelectFixture(preset);
    }
  };

  return (
    <section
      className="card analysis-input-card"
      aria-labelledby="input-heading"
    >
      <div className="card-header">
        <div>
          <h2 id="input-heading" className="card-title">
            Configure Package Analysis
          </h2>
          <p className="card-subtitle">
            Compare an npm release against its source repository to detect
            discrepancy and tampering.
          </p>
        </div>

        {transport.isMock && (
          <div className="preset-buttons" aria-label="Demo presets">
            <span className="preset-label">Load Preset:</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => loadPreset("clean")}
            >
              Clean
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm text-danger"
              onClick={() => loadPreset("suspicious")}
            >
              Suspicious
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm text-warning"
              onClick={() => loadPreset("partial")}
            >
              Partial
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => loadPreset("failed")}
            >
              Error
            </button>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {/* Section 1: Published Package Artifact */}
        <fieldset className="form-section">
          <legend className="section-legend">1. Published Artifact</legend>

          <div
            className="segmented-control"
            role="radiogroup"
            aria-label="Artifact Mode"
          >
            <button
              type="button"
              role="radio"
              aria-checked={artifactKind === "npm"}
              className={`segment-btn ${artifactKind === "npm" ? "active" : ""}`}
              onClick={() => setArtifactKind("npm")}
            >
              NPM Registry Package
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={artifactKind === "upload"}
              className={`segment-btn ${artifactKind === "upload" ? "active" : ""}`}
              onClick={() => setArtifactKind("upload")}
            >
              Upload Package Archive (.tgz)
            </button>
          </div>

          {artifactKind === "npm" ? (
            <div className="form-grid-2">
              <div className="form-field">
                <label htmlFor="npm-name" className="field-label">
                  Package Name <span className="req">*</span>
                </label>
                <input
                  id="npm-name"
                  type="text"
                  className={`text-input ${errors.npmName ? "has-error" : ""}`}
                  placeholder="e.g. lodash or @scope/package"
                  value={npmName}
                  onChange={(e) => {
                    setNpmName(e.target.value);
                    if (errors.npmName)
                      setErrors((prev) => ({ ...prev, npmName: undefined }));
                  }}
                  disabled={isSubmitting}
                  autoComplete="off"
                  spellCheck={false}
                />
                {errors.npmName ? (
                  <span className="field-error" role="alert">
                    {errors.npmName}
                  </span>
                ) : (
                  <span className="field-hint">
                    Scoped names supported (e.g. @org/pkg)
                  </span>
                )}
              </div>

              <div className="form-field">
                <label htmlFor="npm-version" className="field-label">
                  Exact Version <span className="req">*</span>
                </label>
                <input
                  id="npm-version"
                  type="text"
                  className={`text-input ${errors.npmVersion ? "has-error" : ""}`}
                  placeholder="e.g. 1.0.0"
                  value={npmVersion}
                  onChange={(e) => {
                    setNpmVersion(e.target.value);
                    if (errors.npmVersion)
                      setErrors((prev) => ({ ...prev, npmVersion: undefined }));
                  }}
                  disabled={isSubmitting}
                  autoComplete="off"
                  spellCheck={false}
                />
                {errors.npmVersion ? (
                  <span className="field-error" role="alert">
                    {errors.npmVersion}
                  </span>
                ) : (
                  <span className="field-hint">
                    Must be exact semver; no range characters (^, ~)
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="form-field">
              <label htmlFor="pkg-upload" className="field-label">
                Upload Package Tarball (.tgz) <span className="req">*</span>
              </label>
              <div className="upload-box">
                <input
                  id="pkg-upload"
                  type="file"
                  accept=".tgz,.tar.gz,application/gzip,application/x-tar"
                  onChange={handlePackageFileChange}
                  disabled={isSubmitting || isUploadingPackage}
                  className="file-input"
                />
                {packageFile && (
                  <div className="file-info">
                    <span className="file-name">{packageFile.name}</span>
                    <span className="file-size">
                      ({(packageFile.size / 1024).toFixed(1)} KB)
                    </span>
                    {uploadPackageId && (
                      <span className="upload-badge">Uploaded</span>
                    )}
                  </div>
                )}
              </div>
              {errors.uploadPackageId && (
                <span className="field-error" role="alert">
                  {errors.uploadPackageId}
                </span>
              )}
            </div>
          )}
        </fieldset>

        {/* Section 2: Source Code Location */}
        <fieldset className="form-section">
          <legend className="section-legend">2. Source Code Snapshot</legend>

          <div
            className="segmented-control"
            role="radiogroup"
            aria-label="Source Mode"
          >
            <button
              type="button"
              role="radio"
              aria-checked={sourceKind === "auto"}
              className={`segment-btn ${sourceKind === "auto" ? "active" : ""}`}
              onClick={() => setSourceKind("auto")}
            >
              Automatic Source Resolution
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={sourceKind === "github"}
              className={`segment-btn ${sourceKind === "github" ? "active" : ""}`}
              onClick={() => setSourceKind("github")}
            >
              Explicit GitHub Commit
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={sourceKind === "upload"}
              className={`segment-btn ${sourceKind === "upload" ? "active" : ""}`}
              onClick={() => setSourceKind("upload")}
            >
              Upload Source Archive
            </button>
          </div>

          {sourceKind === "auto" && (
            <div className="info-callout">
              <p>
                The engine will inspect npm registry metadata, match release
                tags, and verify commit signatures. If source mapping is
                ambiguous, the analysis will record the ambiguity.
              </p>
            </div>
          )}

          {sourceKind === "github" && (
            <div className="form-stack">
              <div className="form-grid-2">
                <div className="form-field">
                  <label htmlFor="github-url" className="field-label">
                    GitHub Repository URL <span className="req">*</span>
                  </label>
                  <input
                    id="github-url"
                    type="url"
                    className={`text-input ${errors.githubUrl ? "has-error" : ""}`}
                    placeholder="https://github.com/owner/repository"
                    value={githubUrl}
                    onChange={(e) => {
                      setGithubUrl(e.target.value);
                      if (errors.githubUrl)
                        setErrors((prev) => ({
                          ...prev,
                          githubUrl: undefined,
                        }));
                    }}
                    disabled={isSubmitting}
                    spellCheck={false}
                  />
                  {errors.githubUrl && (
                    <span className="field-error" role="alert">
                      {errors.githubUrl}
                    </span>
                  )}
                </div>

                <div className="form-field">
                  <label htmlFor="github-commit" className="field-label">
                    Exact Git Commit SHA <span className="req">*</span>
                  </label>
                  <input
                    id="github-commit"
                    type="text"
                    maxLength={40}
                    className={`text-input font-mono ${errors.githubCommit ? "has-error" : ""}`}
                    placeholder="40-hex-character commit hash"
                    value={githubCommit}
                    onChange={(e) => {
                      setGithubCommit(e.target.value);
                      if (errors.githubCommit)
                        setErrors((prev) => ({
                          ...prev,
                          githubCommit: undefined,
                        }));
                    }}
                    disabled={isSubmitting}
                    spellCheck={false}
                  />
                  {errors.githubCommit ? (
                    <span className="field-error" role="alert">
                      {errors.githubCommit}
                    </span>
                  ) : (
                    <span className="field-hint">
                      Full 40-character commit hash required
                    </span>
                  )}
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="package-root-gh" className="field-label">
                  Monorepo Package Root (Optional)
                </label>
                <input
                  id="package-root-gh"
                  type="text"
                  className={`text-input ${errors.packageRoot ? "has-error" : ""}`}
                  placeholder="e.g. packages/core (leave blank if package is at root)"
                  value={packageRoot}
                  onChange={(e) => {
                    setPackageRoot(e.target.value);
                    if (errors.packageRoot)
                      setErrors((prev) => ({
                        ...prev,
                        packageRoot: undefined,
                      }));
                  }}
                  disabled={isSubmitting}
                  spellCheck={false}
                />
                {errors.packageRoot && (
                  <span className="field-error" role="alert">
                    {errors.packageRoot}
                  </span>
                )}
              </div>
            </div>
          )}

          {sourceKind === "upload" && (
            <div className="form-stack">
              <div className="form-field">
                <label htmlFor="source-upload" className="field-label">
                  Upload Source Archive (.zip / .tar.gz){" "}
                  <span className="req">*</span>
                </label>
                <div className="upload-box">
                  <input
                    id="source-upload"
                    type="file"
                    accept=".zip,.tar.gz,.tgz"
                    onChange={handleSourceFileChange}
                    disabled={isSubmitting || isUploadingSource}
                    className="file-input"
                  />
                  {sourceFile && (
                    <div className="file-info">
                      <span className="file-name">{sourceFile.name}</span>
                      <span className="file-size">
                        ({(sourceFile.size / 1024).toFixed(1)} KB)
                      </span>
                      {uploadSourceId && (
                        <span className="upload-badge">Uploaded</span>
                      )}
                    </div>
                  )}
                </div>
                {errors.uploadSourceId && (
                  <span className="field-error" role="alert">
                    {errors.uploadSourceId}
                  </span>
                )}
              </div>

              <div className="form-field">
                <label htmlFor="package-root-up" className="field-label">
                  Monorepo Package Root (Optional)
                </label>
                <input
                  id="package-root-up"
                  type="text"
                  className={`text-input ${errors.packageRoot ? "has-error" : ""}`}
                  placeholder="e.g. packages/core (leave blank if package is at root)"
                  value={packageRoot}
                  onChange={(e) => {
                    setPackageRoot(e.target.value);
                    if (errors.packageRoot)
                      setErrors((prev) => ({
                        ...prev,
                        packageRoot: undefined,
                      }));
                  }}
                  disabled={isSubmitting}
                  spellCheck={false}
                />
                {errors.packageRoot && (
                  <span className="field-error" role="alert">
                    {errors.packageRoot}
                  </span>
                )}
              </div>
            </div>
          )}
        </fieldset>

        {submitError && (
          <div className="banner banner-error mb-4" role="alert">
            {submitError}
          </div>
        )}

        <div className="form-actions">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isSubmitting || isUploadingPackage || isUploadingSource}
            disabled={isSubmitting || isUploadingPackage || isUploadingSource}
          >
            {isSubmitting ? "Submitting Analysis…" : "Run Integrity Analysis"}
          </Button>
          <span className="action-hint">
            Deterministic rule check &amp; evidence-bounded model assessment
          </span>
        </div>
      </form>
    </section>
  );
};
