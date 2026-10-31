import React, { useMemo } from "react";
import type { FileSummary, Finding } from "@vajra/contracts";
import {
  getFileStatusMeta,
  getSeverityMeta,
  shortHash,
} from "../utils/formatters.js";
import { Badge } from "./Common.js";

export type FileStatusFilter =
  "all" | "modified" | "added" | "removed" | "identical" | "skipped";

export interface SearchableFileListProps {
  files: FileSummary[];
  findings: Finding[];
  selectedFileId: string | null;
  onSelectFile: (fileId: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: FileStatusFilter;
  onStatusFilterChange: (status: FileStatusFilter) => void;
  findingsOnly: boolean;
  onFindingsOnlyChange: (enabled: boolean) => void;
}

export const SearchableFileList: React.FC<SearchableFileListProps> = ({
  files,
  findings,
  selectedFileId,
  onSelectFile,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  findingsOnly,
  onFindingsOnlyChange,
}) => {
  // Map finding ID to finding for quick lookup
  const findingMap = useMemo(() => {
    const map = new Map<string, Finding>();
    for (const f of findings) {
      map.set(f.id, f);
    }
    return map;
  }, [findings]);

  // Status counts
  const counts = useMemo(() => {
    return {
      all: files.length,
      modified: files.filter((f) => f.status === "modified").length,
      added: files.filter((f) => f.status === "added").length,
      removed: files.filter((f) => f.status === "removed").length,
      identical: files.filter((f) => f.status === "identical").length,
      skipped: files.filter((f) => f.status === "skipped").length,
    };
  }, [files]);

  // Filtered files
  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return files.filter((f) => {
      // Status filter
      if (statusFilter !== "all" && f.status !== statusFilter) {
        return false;
      }
      // Findings only
      if (findingsOnly && f.findingIds.length === 0) {
        return false;
      }
      // Text search
      if (q) {
        const pkgMatch = f.packagePath?.toLowerCase().includes(q) ?? false;
        const srcMatch = f.sourcePath?.toLowerCase().includes(q) ?? false;
        return pkgMatch || srcMatch;
      }
      return true;
    });
  }, [files, searchQuery, statusFilter, findingsOnly]);

  const handleKeyDown = (
    e: React.KeyboardEvent,
    fileId: string,
    index: number,
  ) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelectFile(fileId);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = filteredFiles[index + 1];
      if (next) onSelectFile(next.id);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = filteredFiles[index - 1];
      if (prev) onSelectFile(prev.id);
    }
  };

  return (
    <div className="file-list-panel" role="region" aria-label="Analyzed Files">
      <div className="file-list-controls">
        <div className="search-box">
          <input
            type="search"
            className="text-input search-input"
            placeholder="Search files by path (e.g. index.js, package.json)…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search files"
          />
          {searchQuery && (
            <button
              type="button"
              className="btn-clear-search"
              onClick={() => onSearchChange("")}
              aria-label="Clear search query"
            >
              ✕
            </button>
          )}
        </div>

        <div className="filter-row">
          <div
            className="status-filter-buttons"
            role="tablist"
            aria-label="Filter by file status"
          >
            {(
              [
                ["all", `All (${counts.all})`],
                ["modified", `Modified (${counts.modified})`],
                ["added", `Added (${counts.added})`],
                ["removed", `Removed (${counts.removed})`],
                ["identical", `Identical (${counts.identical})`],
                ["skipped", `Skipped (${counts.skipped})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={statusFilter === key}
                className={`filter-btn ${statusFilter === key ? "active" : ""}`}
                onClick={() => onStatusFilterChange(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="checkbox-label findings-only-toggle">
            <input
              type="checkbox"
              checked={findingsOnly}
              onChange={(e) => onFindingsOnlyChange(e.target.checked)}
            />
            <span>With findings only</span>
          </label>
        </div>

        <div className="file-list-summary">
          <span>
            Showing <strong>{filteredFiles.length}</strong> of {files.length}{" "}
            files
          </span>
        </div>
      </div>

      <div className="file-items-scroll" role="listbox" aria-label="Files">
        {filteredFiles.length === 0 ? (
          <div className="empty-filter-state">
            <p>No files match current search and status filters.</p>
          </div>
        ) : (
          filteredFiles.map((file, idx) => {
            const isSelected = file.id === selectedFileId;
            const statusMeta = getFileStatusMeta(file.status);

            // Get linked findings for this file
            const fileFindings = file.findingIds
              .map((id) => findingMap.get(id))
              .filter(Boolean) as Finding[];

            // Paths display
            const primaryPath =
              file.packagePath ?? file.sourcePath ?? "(unknown path)";
            const hasBothSides = file.packagePath && file.sourcePath;
            const differ = hasBothSides && file.packagePath !== file.sourcePath;

            return (
              <div
                key={file.id}
                role="option"
                aria-selected={isSelected}
                tabIndex={0}
                className={`file-item-row ${isSelected ? "selected" : ""} ${statusMeta.className}`}
                onClick={() => onSelectFile(file.id)}
                onKeyDown={(e) => handleKeyDown(e, file.id, idx)}
              >
                <div className="file-item-status">
                  <span className={`status-badge-pill ${statusMeta.className}`}>
                    {statusMeta.symbol} {statusMeta.label}
                  </span>
                </div>

                <div className="file-item-main">
                  <div className="file-path-title">
                    <span className="primary-path font-mono">
                      {primaryPath}
                    </span>
                    {differ && (
                      <span className="diff-path-hint font-mono">
                        (source: {file.sourcePath})
                      </span>
                    )}
                  </div>

                  <div className="file-item-meta">
                    {file.packageHash && (
                      <span
                        className="hash-tag font-mono"
                        title={`Package SHA-256: ${file.packageHash}`}
                      >
                        pkg: {shortHash(file.packageHash, 4)}
                      </span>
                    )}
                    {file.sourceHash && (
                      <span
                        className="hash-tag font-mono"
                        title={`Source SHA-256: ${file.sourceHash}`}
                      >
                        src: {shortHash(file.sourceHash, 4)}
                      </span>
                    )}
                    {file.binary && <Badge variant="neutral">BINARY</Badge>}
                    {file.truncated && (
                      <Badge variant="warning">TRUNCATED</Badge>
                    )}
                  </div>
                </div>

                {fileFindings.length > 0 && (
                  <div className="file-item-findings">
                    {fileFindings.map((f) => {
                      const sev = getSeverityMeta(f.severity);
                      return (
                        <span
                          key={f.id}
                          className={`finding-indicator-pill ${sev.className}`}
                          title={`[${sev.badgeText}] ${f.title}`}
                        >
                          {sev.symbol} {sev.badgeText}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
