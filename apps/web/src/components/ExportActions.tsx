import React, { useState } from "react";
import type { AnalysisReport } from "@vajra/contracts";
import type { VajraTransport } from "../api/transport.js";
import { Button } from "./Common.js";

export interface ExportActionsProps {
  report: AnalysisReport;
  transport: VajraTransport;
}

export const ExportActions: React.FC<ExportActionsProps> = ({
  report,
  transport,
}) => {
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [isExportingMd, setIsExportingMd] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const downloadFile = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportJson = async () => {
    setIsExportingJson(true);
    setExportError(null);
    try {
      const { blob, filename } = await transport.exportReport(
        report.id,
        "json",
      );
      downloadFile(blob, filename);
    } catch (err: any) {
      setExportError(err.message || "Failed to export JSON report.");
    } finally {
      setIsExportingJson(false);
    }
  };

  const handleExportMarkdown = async () => {
    setIsExportingMd(true);
    setExportError(null);
    try {
      const { blob, filename } = await transport.exportReport(
        report.id,
        "markdown",
      );
      downloadFile(blob, filename);
    } catch (err: any) {
      setExportError(err.message || "Failed to export Markdown report.");
    } finally {
      setIsExportingMd(false);
    }
  };

  const handleCopySummary = () => {
    const summary = [
      `Vajra Package Integrity Review: ${report.artifact.name ?? "unnamed"}@${report.artifact.version ?? ""}`,
      `Status: ${report.status.toUpperCase()} (${report.findings.length} findings, ${report.coverage.comparedFiles}/${report.coverage.totalFiles} files compared)`,
      `Artifact SHA-256: ${report.artifact.sha256}`,
      `Source Commit: ${report.source.commit ?? report.source.snapshotSha256 ?? "unresolved"} (${report.source.method})`,
      `Model Assessment: ${report.model.status.toUpperCase()} (${report.model.id ?? "none"})`,
      ...(report.model.status === "used" && report.model.summary
        ? [`${report.model.id?.toLowerCase().startsWith("qwen") ? "Qwen" : "AI"} Summary (unverified): ${report.model.summary}`]
        : []),
    ].join("\n");

    navigator.clipboard.writeText(summary);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  return (
    <div className="export-bar" role="region" aria-label="Export Actions">
      <div className="export-actions-group">
        <Button
          variant="secondary"
          size="sm"
          isLoading={isExportingJson}
          onClick={handleExportJson}
          title="Download report JSON payload"
        >
          Export JSON
        </Button>

        <Button
          variant="secondary"
          size="sm"
          isLoading={isExportingMd}
          onClick={handleExportMarkdown}
          title="Download report Markdown document"
        >
          Export Markdown
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopySummary}
          title="Copy short text summary to clipboard"
        >
          {copiedSummary ? "Copied" : "Copy summary"}
        </Button>
      </div>

      {exportError && (
        <span className="export-error" role="alert">
          ⚠ {exportError}
        </span>
      )}
    </div>
  );
};
