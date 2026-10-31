import React, { useState } from "react";
import type { AnalysisReport } from "@vajra/contracts";
import { formatDate, shortHash } from "../utils/formatters.js";
import { Badge } from "./Common.js";

export interface ReportOverviewProps {
  report: AnalysisReport;
  isMock?: boolean;
}

export const ReportOverview: React.FC<ReportOverviewProps> = ({
  report,
  isMock = false,
}) => {
  const [copied, setCopied] = useState(false);
  const unresolved = report.source.method === "unresolved";
  const counts = {
    high: report.findings.filter((f) => f.severity === "high").length,
    medium: report.findings.filter((f) => f.severity === "medium").length,
    low: report.findings.filter((f) => f.severity === "low").length,
    info: report.findings.filter((f) => f.severity === "info").length,
  };
  const suspiciousCount = report.findings.filter(
    (finding) => finding.classification === "suspicious_change",
  ).length;
  const inconclusive =
    report.source.method === "unresolved" ||
    report.source.confidence === "low" ||
    report.coverage.skippedFiles > 0 ||
    report.findings.some((finding) => finding.classification === "unresolved");
  const verdict =
    suspiciousCount > 0
      ? {
          tone: "danger",
          title: "Potential tampering detected",
          detail: `${suspiciousCount} suspicious change${suspiciousCount === 1 ? "" : "s"} found. Review the evidence below; this is not proof of malicious intent.`,
        }
      : inconclusive
        ? {
            tone: "warning",
            title: "Unable to rule out tampering",
            detail:
              "The source match or file inspection is incomplete. Review the limitations and evidence before trusting this package.",
          }
        : {
            tone: "success",
            title: "No suspicious changes detected",
            detail:
              "The checks found no suspicious differences in the files compared. This result is not a safety guarantee.",
          };
  const hasQwenSummary =
    !isMock && report.model.status === "used" && Boolean(report.model.summary);
  const summary = hasQwenSummary
    ? report.model.summary!
    : suspiciousCount > 0
      ? `Vajra found ${suspiciousCount} suspicious change${suspiciousCount === 1 ? "" : "s"} among ${report.findings.length} total finding${report.findings.length === 1 ? "" : "s"}. It compared ${report.coverage.comparedFiles} of ${report.coverage.totalFiles} files${report.coverage.skippedFiles ? ` and skipped ${report.coverage.skippedFiles}` : ""}. Review the flagged files and evidence; automated checks cannot confirm intent.`
      : inconclusive
        ? `No suspicious changes were identified in the checks that completed. Vajra compared ${report.coverage.comparedFiles} of ${report.coverage.totalFiles} files and skipped ${report.coverage.skippedFiles}. The incomplete comparison means the package cannot be cleared.`
        : `Vajra compared ${report.coverage.comparedFiles} files and found no suspicious changes. This is not a guarantee that the package is safe.`;
  const limitations = [
    ...new Set([
      ...report.coverage.reasons,
      ...report.source.limitations,
      ...(report.model.reason ? [report.model.reason] : []),
    ]),
  ];
  const copyDigest = async () => {
    await navigator.clipboard.writeText(report.artifact.sha256);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section
      className="report-overview-container simple-report"
      aria-labelledby="report-overview-heading"
    >
      <header className="simple-report-header">
        <div>
          <p className="simple-report-kicker">Analysis report</p>
          <h2 id="report-overview-heading">
            {report.artifact.name ?? "Uploaded package"}
            {report.artifact.version ? `@${report.artifact.version}` : ""}
          </h2>
          <p className="simple-report-date">
            Created {formatDate(report.createdAt)}
          </p>
        </div>
        <div className="simple-report-statuses">
          <Badge
            variant={report.status === "completed" ? "success" : "warning"}
          >
            {report.status === "completed"
              ? "Analysis complete"
              : "Analysis partial"}
          </Badge>
          {isMock && <Badge variant="warning">Demo fixture</Badge>}
        </div>
      </header>

      <section
        className={`tampering-verdict tampering-verdict-${verdict.tone}`}
        aria-label="Package tampering assessment"
        aria-live="polite"
      >
        <span className="tampering-verdict-icon" aria-hidden="true">
          {verdict.tone === "success" ? "✓" : "!"}
        </span>
        <div>
          <h3>{verdict.title}</h3>
          <p>{verdict.detail}</p>
        </div>
      </section>

      <section
        className="model-summary-card report-model-summary"
        aria-labelledby="overall-model-summary-heading"
      >
        <div className="model-summary-heading">
          <h3 id="overall-model-summary-heading">Analysis summary</h3>
          <span>
            {hasQwenSummary
              ? `Qwen-generated · ${report.model.id}`
              : isMock
                ? "Demo data · rule-based overview"
                : "Rule-based overview · Qwen summary unavailable"}
          </span>
        </div>
        <p>{summary}</p>
      </section>

      {unresolved && (
        <p className="simple-notice warning">
          The source could not be matched confidently. Treat source comparisons
          as unresolved.
        </p>
      )}
      {report.status === "partial" && !unresolved && (
        <p className="simple-notice warning">
          Some checks or files were not fully analyzed. Review the limitations
          below.
        </p>
      )}

      <div className="simple-report-grid">
        <section
          className="simple-report-section"
          aria-labelledby="simple-artifact-heading"
        >
          <h3 id="simple-artifact-heading">Package checked</h3>
          <p className="simple-primary-value">
            {report.artifact.name ?? "Uploaded archive"}{" "}
            {report.artifact.version ?? ""}
          </p>
          <div className="simple-digest">
            <code title={report.artifact.sha256}>
              {shortHash(report.artifact.sha256, 16)}
            </code>
            <button type="button" onClick={copyDigest}>
              {copied ? "Copied" : "Copy digest"}
            </button>
          </div>
        </section>

        <section
          className="simple-report-section"
          aria-labelledby="simple-source-heading"
        >
          <h3 id="simple-source-heading">Source used</h3>
          {report.source.repositoryUrl ? (
            <a
              className="simple-primary-value"
              href={report.source.repositoryUrl}
              target="_blank"
              rel="noreferrer"
            >
              {report.source.repositoryUrl.replace(
                /^https:\/\/github\.com\//,
                "",
              )}
            </a>
          ) : (
            <p className="simple-primary-value">
              {report.source.method === "user_source_snapshot"
                ? "Uploaded source archive"
                : "Source not identified"}
            </p>
          )}
          {report.source.commit && (
            <p className="simple-secondary-value">
              Commit{" "}
              <code title={report.source.commit}>
                {shortHash(report.source.commit, 12)}
              </code>
            </p>
          )}
          <p className="simple-secondary-value">
            Match confidence: <strong>{report.source.confidence}</strong>
          </p>
        </section>

        <section
          className="simple-report-section"
          aria-labelledby="simple-findings-heading"
        >
          <h3 id="simple-findings-heading">Findings</h3>
          <p className="simple-primary-value">{report.findings.length} total</p>
          <div className="simple-counts">
            <span className="count-high">{counts.high} high</span>
            <span className="count-medium">{counts.medium} medium</span>
            <span>{counts.low} low</span>
            <span>{counts.info} info</span>
          </div>
        </section>

        <section
          className="simple-report-section"
          aria-labelledby="simple-coverage-heading"
        >
          <h3 id="simple-coverage-heading">Coverage</h3>
          <p className="simple-primary-value">
            {report.coverage.comparedFiles} of {report.coverage.totalFiles}{" "}
            files compared
          </p>
          <p className="simple-secondary-value">
            {report.coverage.skippedFiles} skipped ·{" "}
            {report.coverage.reasons.length} limitation
            {report.coverage.reasons.length === 1 ? "" : "s"}
          </p>
        </section>
      </div>

      <div className="simple-model-row" aria-label="AI review status">
        <span>
          <strong>AI review</strong>
          {isMock
            ? "Demo fixture — no live model ran"
            : report.model.status === "used"
              ? `Used · ${report.model.id}`
              : report.model.status === "failed"
                ? `Unavailable · ${report.model.id ?? "configured model"}`
                : "Not configured"}
        </span>
        <span>
          {isMock
            ? "Findings and explanations are synthetic sample data."
            : report.model.status === "used"
              ? "Rules raise findings; AI adds unverified context for review."
              : report.model.status === "failed"
                ? "Rule findings are available; AI context could not be added."
                : "Findings come from rule-based checks; no AI review was run."}
        </span>
      </div>

      {limitations.length > 0 && (
        <details className="simple-limitations">
          <summary>Limitations and skipped analysis</summary>
          <ul>
            {limitations.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
};
