import type { AnalysisReport } from "@vajra/contracts";

export function renderMarkdown(report: AnalysisReport): string {
  const lines: string[] = [];
  lines.push(`# Vajra Analysis Report`);
  lines.push("");
  lines.push(`- ID: ${report.id}`);
  lines.push(`- Status: ${report.status}`);
  lines.push(`- Created: ${report.createdAt}`);
  lines.push(
    `- Artifact: ${report.artifact.name ?? "?"} ${report.artifact.version ?? ""} (${report.artifact.sha256})`,
  );
  lines.push(
    `- Source: ${report.source.method} (confidence ${report.source.confidence})`,
  );
  if (report.source.repositoryUrl)
    lines.push(`- Repository: ${report.source.repositoryUrl}`);
  if (report.source.commit) lines.push(`- Commit: ${report.source.commit}`);
  lines.push(`- Model: ${report.model.id ?? "none"} (${report.model.status})`);
  lines.push(
    `- Coverage: ${report.coverage.comparedFiles}/${report.coverage.totalFiles} compared, ${report.coverage.skippedFiles} skipped`,
  );
  lines.push("");
  lines.push("## Findings");
  if (!report.findings.length) lines.push("No findings.");
  for (const f of report.findings) {
    lines.push(`### ${f.title} (${f.severity}/${f.confidence})`);
    lines.push(f.explanation);
    lines.push("");
  }
  lines.push("## Files");
  for (const f of report.files) {
    lines.push(
      `- ${f.id}: ${f.status} ${f.packagePath ?? ""} ${f.sourcePath ?? ""}`,
    );
  }
  return lines.join("\n");
}

export function renderJson(report: AnalysisReport): string {
  return JSON.stringify(report, null, 2);
}
