import React, { useState } from "react";
import type { AnalysisReport } from "@vajra/contracts";
import {
  formatDate,
  formatDuration,
  getConfidenceMeta,
  getJobStatusBadge,
  getSeverityMeta,
  shortHash,
} from "../utils/formatters.js";
import { Badge } from "./Common.js";

export interface ReportOverviewProps {
  report: AnalysisReport;
  isMock?: boolean;
}

export const ReportOverview: React.FC<ReportOverviewProps> = ({
  report,
  isMock = false,
}) => {
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const statusBadge = getJobStatusBadge(report.status);
  const confMeta = getConfidenceMeta(report.source.confidence);
  const isSourceUnresolved =
    report.source.method === "unresolved" ||
    (!report.source.commit && !report.source.snapshotSha256);

  // Group findings count by severity directly from actual report.findings
  const counts = {
    high: report.findings.filter((f) => f.severity === "high").length,
    medium: report.findings.filter((f) => f.severity === "medium").length,
    low: report.findings.filter((f) => f.severity === "low").length,
    info: report.findings.filter((f) => f.severity === "info").length,
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(id);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  return (
    <section
      className="report-overview-container"
      aria-labelledby="report-overview-heading"
    >
      {/* Top Banner with Status and Metas */}
      <div className="overview-header-card">
        <div className="overview-status-line">
          <div className="status-indicator-block">
            <Badge
              variant={report.status === "completed" ? "success" : "warning"}
              symbol={statusBadge.symbol}
              className="badge-lg"
            >
              {statusBadge.label} REPORT
            </Badge>
            {isMock && (
              <Badge variant="warning" symbol="🧪" className="badge-lg">
                DEMO FIXTURE
              </Badge>
            )}
            <span className="analysis-id-chip">
              ID: <code>{report.id}</code>
            </span>
          </div>

          <div className="overview-meta-chips">
            <span className="meta-chip" title="Execution duration">
              ⏱ {formatDuration(report.durationMs)}
            </span>
            <span className="meta-chip" title="Timestamp in your locale">
              📅 {formatDate(report.createdAt)}
            </span>
            <span className="meta-chip" title="Vajra engine version">
              ⚙ Tool v{report.toolVersion} / Rules v{report.rulesVersion}
            </span>
          </div>
        </div>

        {isMock && (
          <div className="fixture-watermark-notice" role="status">
            <span className="notice-icon" aria-hidden="true">
              🧪
            </span>
            <span>
              <strong>Synthetic Development Fixture:</strong> This review is
              backed by mock data for demonstration purposes. It does not
              represent a live engine assessment.
            </span>
          </div>
        )}

        {isSourceUnresolved && (
          <div className="unresolved-source-alert" role="alert">
            <span className="notice-icon" aria-hidden="true">
              ⚠️
            </span>
            <div className="notice-content">
              <strong>Source Unresolved:</strong> The source repository, release
              tag, or commit could not be mapped unambiguously (
              {report.source.method}). Comparison is partial or bounded by
              published artifact metadata. Check source limitations below.
            </div>
          </div>
        )}

        {report.status === "partial" && !isSourceUnresolved && (
          <div className="partial-warning-notice" role="alert">
            <span className="notice-icon" aria-hidden="true">
              ⚠
            </span>
            <div className="notice-content">
              <strong>Partial Analysis:</strong> This analysis was completed
              with partial coverage or unconfigured model. Results contain
              deterministic findings but may have skipped certain checks or
              files. Review limitations below.
            </div>
          </div>
        )}

        <div className="findings-stat-grid">
          <div className="stat-card stat-total-files">
            <span className="stat-label">Compared Files</span>
            <span className="stat-val">
              {report.coverage.comparedFiles} / {report.coverage.totalFiles}
            </span>
            {report.coverage.skippedFiles > 0 && (
              <span className="stat-sub text-warning">
                {report.coverage.skippedFiles} skipped
              </span>
            )}
          </div>

          <div className="stat-card stat-sev-high">
            <span className="stat-label">
              <span className="stat-dot dot-high" /> High Findings
            </span>
            <span className="stat-val">{counts.high}</span>
            <span className="stat-sub">
              {counts.high > 0 ? "Requires review" : "None detected"}
            </span>
          </div>

          <div className="stat-card stat-sev-med">
            <span className="stat-label">
              <span className="stat-dot dot-med" /> Medium Findings
            </span>
            <span className="stat-val">{counts.medium}</span>
            <span className="stat-sub">
              {counts.medium > 0 ? "Inspect diff" : "None detected"}
            </span>
          </div>

          <div className="stat-card stat-sev-low">
            <span className="stat-label">
              <span className="stat-dot dot-low" /> Low Findings
            </span>
            <span className="stat-val">{counts.low}</span>
            <span className="stat-sub">Minor diffs</span>
          </div>

          <div className="stat-card stat-sev-info">
            <span className="stat-label">
              <span className="stat-dot dot-info" /> Informational
            </span>
            <span className="stat-val">{counts.info}</span>
            <span className="stat-sub">Packaging metadata</span>
          </div>
        </div>
      </div>

      {/* Grid of Identity & Source Cards */}
      <div className="overview-details-grid">
        {/* Artifact Identity Card */}
        <div className="detail-card">
          <div className="detail-card-header">
            <h3 className="detail-title">
              <span className="card-icon" aria-hidden="true">
                📦
              </span>
              Published Artifact
            </h3>
          </div>

          <dl className="detail-dl">
            <div className="dl-row">
              <dt>Package Name:</dt>
              <dd>
                <strong>{report.artifact.name ?? "unnamed"}</strong>
              </dd>
            </div>
            <div className="dl-row">
              <dt>Version:</dt>
              <dd>
                <code className="font-mono">
                  {report.artifact.version ?? "unknown"}
                </code>
              </dd>
            </div>
            <div className="dl-row">
              <dt>SHA-256 Digest:</dt>
              <dd className="hash-dd">
                <code className="font-mono" title={report.artifact.sha256}>
                  {shortHash(report.artifact.sha256, 12)}
                </code>
                <button
                  type="button"
                  className="btn-copy"
                  onClick={() =>
                    copyToClipboard(report.artifact.sha256, "artifact")
                  }
                  title="Copy full SHA-256 hash"
                >
                  {copiedHash === "artifact" ? "Copied!" : "Copy"}
                </button>
              </dd>
            </div>
          </dl>
        </div>

        {/* Source Provenance Card */}
        <div className="detail-card">
          <div className="detail-card-header">
            <h3 className="detail-title">
              <span className="card-icon" aria-hidden="true">
                🌱
              </span>
              Source Provenance
            </h3>
            <Badge variant="info" className={confMeta.className}>
              {confMeta.badgeText}
            </Badge>
          </div>

          <dl className="detail-dl">
            <div className="dl-row">
              <dt>Resolution Method:</dt>
              <dd>
                <code>{report.source.method}</code>
              </dd>
            </div>
            {report.source.repositoryUrl && (
              <div className="dl-row">
                <dt>Repository:</dt>
                <dd>
                  <a
                    href={report.source.repositoryUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="link-external"
                  >
                    {report.source.repositoryUrl.replace(
                      /^https:\/\/github\.com\//,
                      "",
                    )}{" "}
                    ↗
                  </a>
                </dd>
              </div>
            )}
            {report.source.commit && (
              <div className="dl-row">
                <dt>Source Commit:</dt>
                <dd className="hash-dd">
                  <code className="font-mono" title={report.source.commit}>
                    {shortHash(report.source.commit, 8)}
                  </code>
                  <button
                    type="button"
                    className="btn-copy"
                    onClick={() =>
                      copyToClipboard(report.source.commit!, "commit")
                    }
                    title="Copy full git commit SHA"
                  >
                    {copiedHash === "commit" ? "Copied!" : "Copy"}
                  </button>
                </dd>
              </div>
            )}
            {report.source.snapshotSha256 && (
              <div className="dl-row">
                <dt>Snapshot SHA-256:</dt>
                <dd className="hash-dd">
                  <code
                    className="font-mono"
                    title={report.source.snapshotSha256}
                  >
                    {shortHash(report.source.snapshotSha256, 10)}
                  </code>
                </dd>
              </div>
            )}
            {report.source.packageRoot !== undefined && (
              <div className="dl-row">
                <dt>Package Root:</dt>
                <dd>
                  <code>{report.source.packageRoot || "(root)"}</code>
                </dd>
              </div>
            )}
          </dl>

          {report.source.evidence.length > 0 && (
            <div className="card-sub-section">
              <h4 className="sub-section-title">Resolution Evidence:</h4>
              <ul className="bullet-list">
                {report.source.evidence.map((ev, i) => (
                  <li key={i}>{ev}</li>
                ))}
              </ul>
            </div>
          )}

          {report.source.limitations.length > 0 && (
            <div className="card-sub-section">
              <h4 className="sub-section-title text-warning">
                Resolution Limitations:
              </h4>
              <ul className="bullet-list text-warning">
                {report.source.limitations.map((lim, i) => (
                  <li key={i}>⚠ {lim}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* AI Model Assessment Card */}
        <div className="detail-card">
          <div className="detail-card-header">
            <h3 className="detail-title">
              <span className="card-icon" aria-hidden="true">
                🤖
              </span>
              AI Model Assessment
            </h3>
            <Badge
              variant={
                report.model.status === "used"
                  ? "success"
                  : report.model.status === "failed"
                    ? "danger"
                    : "neutral"
              }
            >
              {report.model.status.toUpperCase()}
            </Badge>
          </div>

          <dl className="detail-dl">
            <div className="dl-row">
              <dt>Model ID:</dt>
              <dd>
                {report.model.id ? (
                  <code className="font-mono">{report.model.id}</code>
                ) : (
                  <span className="text-muted">None configured</span>
                )}
              </dd>
            </div>
            <div className="dl-row">
              <dt>Status:</dt>
              <dd>
                <strong>{report.model.status}</strong>
              </dd>
            </div>
            {report.model.reason && (
              <div className="dl-row">
                <dt>Details:</dt>
                <dd className="text-secondary">{report.model.reason}</dd>
              </div>
            )}
          </dl>

          <p className="card-hint">
            Vajra requires the model to cite only verified finding evidence IDs;
            models cannot fabricate line locations.
          </p>
        </div>

        {/* Coverage & Limitations Card */}
        <div className="detail-card">
          <div className="detail-card-header">
            <h3 className="detail-title">
              <span className="card-icon" aria-hidden="true">
                📊
              </span>
              Coverage &amp; Boundaries
            </h3>
          </div>

          <dl className="detail-dl">
            <div className="dl-row">
              <dt>Total Files:</dt>
              <dd>{report.coverage.totalFiles}</dd>
            </div>
            <div className="dl-row">
              <dt>Compared Files:</dt>
              <dd>{report.coverage.comparedFiles}</dd>
            </div>
            <div className="dl-row">
              <dt>Skipped Files:</dt>
              <dd>{report.coverage.skippedFiles}</dd>
            </div>
          </dl>

          {report.coverage.reasons.length > 0 ? (
            <div className="card-sub-section">
              <h4 className="sub-section-title text-warning">
                Coverage Limitations:
              </h4>
              <ul className="bullet-list text-warning">
                {report.coverage.reasons.map((r, i) => (
                  <li key={i}>⚠ {r}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="card-hint text-success">
              ✓ All files in package and source archives were processed within
              boundary limits.
            </p>
          )}
        </div>
      </div>
    </section>
  );
};
