import React, { useState } from "react";
import type { FileDetail, FileSummary } from "@vajra/contracts";
import { getFileStatusMeta } from "../utils/formatters.js";
import { Badge, LoadingState } from "./Common.js";

export type DiffViewMode = "diff" | "package" | "source";

export interface DiffViewerProps {
  fileSummary: FileSummary | null;
  detail: FileDetail | null;
  isLoading: boolean;
  error?: string | null;
  isMock?: boolean;
  highlightRange?: {
    side: "package" | "source";
    startLine?: number;
    endLine?: number;
  };
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  fileSummary,
  detail,
  isLoading,
  error,
  isMock = false,
  highlightRange,
}) => {
  const [viewMode, setViewMode] = useState<DiffViewMode>("diff");

  if (!fileSummary) {
    return (
      <div className="diff-empty-state">
        <span className="empty-icon" aria-hidden="true">
          📄
        </span>
        <h4 className="empty-title">No File Selected</h4>
        <p className="empty-desc">
          Select a file from the list to inspect diff and evidence.
        </p>
      </div>
    );
  }

  const statusMeta = getFileStatusMeta(fileSummary.status);
  const pkgPath = fileSummary.packagePath ?? "—";
  const srcPath = fileSummary.sourcePath ?? "—";
  const isTruncated = Boolean(detail?.truncated || fileSummary.truncated);
  const diffLinesCount = detail?.unifiedDiff
    ? detail.unifiedDiff.split("\n").length
    : 0;

  return (
    <div
      className="diff-viewer-panel"
      role="region"
      aria-label="Code and Diff Viewer"
    >
      {/* Diff Toolbar */}
      <div className="diff-toolbar">
        <div className="diff-file-meta">
          <span className={`status-badge-pill ${statusMeta.className}`}>
            {statusMeta.symbol} {statusMeta.label}
          </span>
          <span className="diff-file-path font-mono">
            {fileSummary.packagePath ?? fileSummary.sourcePath}
          </span>
          {fileSummary.binary && <Badge variant="neutral">BINARY</Badge>}
          {isTruncated && (
            <Badge variant="warning">TRUNCATED (512 KB CAP)</Badge>
          )}
          {isMock && <Badge variant="warning">FIXTURE DIFF</Badge>}
          {diffLinesCount > 0 && viewMode === "diff" && (
            <span className="diff-line-count font-mono">
              {diffLinesCount} lines
            </span>
          )}
        </div>

        <div
          className="diff-mode-toggle"
          role="radiogroup"
          aria-label="View Mode"
        >
          <button
            type="button"
            role="radio"
            aria-checked={viewMode === "diff"}
            className={`mode-btn ${viewMode === "diff" ? "active" : ""}`}
            onClick={() => setViewMode("diff")}
          >
            Unified Diff
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={viewMode === "package"}
            className={`mode-btn ${viewMode === "package" ? "active" : ""}`}
            onClick={() => setViewMode("package")}
            disabled={!detail || detail.packageText === null}
          >
            Package Text
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={viewMode === "source"}
            className={`mode-btn ${viewMode === "source" ? "active" : ""}`}
            onClick={() => setViewMode("source")}
            disabled={!detail || detail.sourceText === null}
          >
            Source Text
          </button>
        </div>
      </div>

      {/* Side-by-side path & hash metadata */}
      <div className="diff-paths-bar">
        <div className="path-cell">
          <span className="side-label">Source side:</span>
          <span className="path-text font-mono">{srcPath}</span>
        </div>
        <div className="path-cell">
          <span className="side-label">Package side:</span>
          <span className="path-text font-mono">{pkgPath}</span>
        </div>
      </div>

      {/* Content Area */}
      <div className="diff-content-viewport">
        {isTruncated && (
          <div className="diff-truncation-alert" role="status">
            <span className="notice-icon" aria-hidden="true">
              ⚠️
            </span>
            <span>
              <strong>Preview Truncated:</strong> File exceeded the 512 KB
              review preview limit. Diff and content views represent the bounded
              prefix.
            </span>
          </div>
        )}
        {isLoading ? (
          <LoadingState message="Loading file detail & diff…" />
        ) : error ? (
          <div className="diff-error-state" role="alert">
            <span className="error-icon" aria-hidden="true">
              ⚠
            </span>
            <p>{error}</p>
          </div>
        ) : fileSummary.binary ? (
          <div className="diff-special-notice">
            <span className="notice-icon" aria-hidden="true">
              🔒
            </span>
            <h4>Binary File</h4>
            <p>Binary contents are excluded from textual diff review.</p>
          </div>
        ) : !detail ? (
          <div className="diff-special-notice">
            <p>No detail payload available for this file.</p>
          </div>
        ) : viewMode === "diff" ? (
          renderUnifiedDiff(detail.unifiedDiff, fileSummary.status)
        ) : viewMode === "package" ? (
          renderSingleFileText(detail.packageText, "package", highlightRange)
        ) : (
          renderSingleFileText(detail.sourceText, "source", highlightRange)
        )}
      </div>
    </div>
  );
};

function renderUnifiedDiff(diffText: string, status: string): React.ReactNode {
  if (!diffText.trim()) {
    if (status === "identical") {
      return (
        <div className="diff-special-notice">
          <span className="notice-icon text-success" aria-hidden="true">
            ✓
          </span>
          <h4>Files Are Byte-for-Byte Identical</h4>
          <p>
            Package and source copies have identical raw cryptographic hashes.
          </p>
        </div>
      );
    }
    return (
      <div className="diff-special-notice">
        <p>No textual diff generated.</p>
      </div>
    );
  }

  const lines = diffText.split("\n");

  return (
    <pre className="diff-code-pre font-mono">
      <code>
        {lines.map((line, idx) => {
          let lineType = "context";
          if (
            line.startsWith("+++") ||
            line.startsWith("---") ||
            line.startsWith("===")
          ) {
            lineType = "header";
          } else if (line.startsWith("@@")) {
            lineType = "hunk";
          } else if (line.startsWith("+")) {
            lineType = "add";
          } else if (line.startsWith("-")) {
            lineType = "del";
          }

          return (
            <div key={idx} className={`diff-line line-${lineType}`}>
              <span className="line-prefix" aria-hidden="true">
                {line.charAt(0) || " "}
              </span>
              <span className="line-text">{line.slice(1) || line}</span>
            </div>
          );
        })}
      </code>
    </pre>
  );
}

function renderSingleFileText(
  text: string | null,
  side: "package" | "source",
  highlightRange?: {
    side: "package" | "source";
    startLine?: number;
    endLine?: number;
  },
): React.ReactNode {
  if (text === null) {
    return (
      <div className="diff-special-notice">
        <p>This file does not exist on the {side} side.</p>
      </div>
    );
  }

  const lines = text.split("\n");

  return (
    <pre className="file-code-pre font-mono">
      <code>
        {lines.map((line, idx) => {
          const lineNum = idx + 1;
          const isHighlighted =
            highlightRange &&
            highlightRange.side === side &&
            highlightRange.startLine !== undefined &&
            highlightRange.endLine !== undefined &&
            lineNum >= highlightRange.startLine &&
            lineNum <= highlightRange.endLine;

          return (
            <div
              key={idx}
              className={`code-line ${isHighlighted ? "line-highlighted" : ""}`}
            >
              <span className="line-num" aria-hidden="true">
                {lineNum}
              </span>
              <span className="line-content">{line}</span>
            </div>
          );
        })}
      </code>
    </pre>
  );
}
