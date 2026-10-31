import type {
  Classification,
  Confidence,
  JobStatus,
  Severity,
  Stage,
} from "@vajra/contracts";

export function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return isoString;
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function shortHash(hash: string | undefined | null, length = 8): string {
  if (!hash) return "—";
  if (hash.length <= length * 2) return hash;
  return `${hash.slice(0, length)}…${hash.slice(-length)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface SeverityMeta {
  label: string;
  badgeText: string;
  symbol: string;
  className: string;
}

export function getSeverityMeta(severity: Severity): SeverityMeta {
  switch (severity) {
    case "high":
      return {
        label: "High Severity",
        badgeText: "HIGH",
        symbol: "▲",
        className: "badge-sev-high",
      };
    case "medium":
      return {
        label: "Medium Severity",
        badgeText: "MEDIUM",
        symbol: "◆",
        className: "badge-sev-med",
      };
    case "low":
      return {
        label: "Low Severity",
        badgeText: "LOW",
        symbol: "●",
        className: "badge-sev-low",
      };
    case "info":
    default:
      return {
        label: "Informational",
        badgeText: "INFO",
        symbol: "○",
        className: "badge-sev-info",
      };
  }
}

export interface ConfidenceMeta {
  label: string;
  badgeText: string;
  className: string;
}

export function getConfidenceMeta(confidence: Confidence): ConfidenceMeta {
  switch (confidence) {
    case "high":
      return {
        label: "High Confidence",
        badgeText: "HIGH CONFIDENCE",
        className: "badge-conf-high",
      };
    case "medium":
      return {
        label: "Medium Confidence",
        badgeText: "MED CONFIDENCE",
        className: "badge-conf-med",
      };
    case "low":
    default:
      return {
        label: "Low Confidence",
        badgeText: "LOW CONFIDENCE",
        className: "badge-conf-low",
      };
  }
}

export function getClassificationLabel(cls: Classification): string {
  switch (cls) {
    case "suspicious_change":
      return "Suspicious Change";
    case "explained_packaging":
      return "Explained Packaging";
    case "generated_unverified":
      return "Generated (Unverified)";
    case "exact_match":
      return "Exact Match";
    case "unresolved":
      return "Unresolved Difference";
    default:
      return cls;
  }
}

export function getFileStatusMeta(
  status: "identical" | "added" | "removed" | "modified" | "skipped",
) {
  switch (status) {
    case "modified":
      return { label: "Modified", symbol: "M", className: "status-modified" };
    case "added":
      return { label: "Added", symbol: "+", className: "status-added" };
    case "removed":
      return { label: "Removed", symbol: "-", className: "status-removed" };
    case "identical":
      return { label: "Identical", symbol: "=", className: "status-identical" };
    case "skipped":
      return { label: "Skipped", symbol: "!", className: "status-skipped" };
  }
}

export function getStageLabel(stage: Stage): string {
  switch (stage) {
    case "queued":
      return "Queued in analysis pipeline";
    case "retrieving":
      return "Retrieving npm artifact and source archive";
    case "resolving":
      return "Resolving source commit and repository mapping";
    case "comparing":
      return "Comparing file inventories and computing diffs";
    case "assessing":
      return "Assessing security rules and contextualizing evidence";
    case "done":
      return "Analysis pipeline completed";
    default:
      return stage;
  }
}

export function getJobStatusBadge(status: JobStatus) {
  switch (status) {
    case "completed":
      return { label: "COMPLETED", className: "job-completed", symbol: "✓" };
    case "partial":
      return { label: "PARTIAL", className: "job-partial", symbol: "⚠" };
    case "running":
      return { label: "RUNNING", className: "job-running", symbol: "◌" };
    case "queued":
      return { label: "QUEUED", className: "job-queued", symbol: "⏳" };
    case "failed":
      return { label: "FAILED", className: "job-failed", symbol: "✕" };
  }
}
