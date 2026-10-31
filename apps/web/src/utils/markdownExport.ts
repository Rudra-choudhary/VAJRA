import type { AnalysisReport, Finding, FileSummary } from "@vajra/contracts";

export function generateMarkdownReport(report: AnalysisReport): string {
  const lines: string[] = [];

  lines.push(`# Vajra Package Integrity Review Report`);
  lines.push(``);
  lines.push(`- **Report ID:** \`${report.id}\``);
  lines.push(`- **Status:** \`${report.status.toUpperCase()}\``);
  lines.push(`- **Created At (UTC):** ${report.createdAt}`);
  lines.push(`- **Tool Version:** \`${report.toolVersion}\``);
  lines.push(`- **Rules Version:** \`${report.rulesVersion}\``);
  lines.push(`- **Duration:** ${report.durationMs}ms`);
  lines.push(``);

  lines.push(`## 1. Artifact Identity`);
  lines.push(``);
  lines.push(`- **Package Name:** \`${report.artifact.name ?? "unnamed"}\``);
  lines.push(`- **Version:** \`${report.artifact.version ?? "unknown"}\``);
  lines.push(`- **Artifact SHA-256:** \`${report.artifact.sha256}\``);
  lines.push(``);

  lines.push(`## 2. Source Provenance`);
  lines.push(``);
  lines.push(`- **Resolution Method:** \`${report.source.method}\``);
  lines.push(
    `- **Resolution Confidence:** \`${report.source.confidence.toUpperCase()}\``,
  );
  if (report.source.repositoryUrl) {
    lines.push(`- **Repository URL:** ${report.source.repositoryUrl}`);
  }
  if (report.source.commit) {
    lines.push(`- **Source Commit:** \`${report.source.commit}\``);
  }
  if (report.source.snapshotSha256) {
    lines.push(`- **Snapshot SHA-256:** \`${report.source.snapshotSha256}\``);
  }
  if (report.source.packageRoot) {
    lines.push(`- **Package Root:** \`${report.source.packageRoot}\``);
  }

  if (report.source.evidence.length > 0) {
    lines.push(``);
    lines.push(`### Source Resolution Evidence`);
    for (const ev of report.source.evidence) {
      lines.push(`- ${ev}`);
    }
  }

  if (report.source.limitations.length > 0) {
    lines.push(``);
    lines.push(`### Source Resolution Limitations`);
    for (const lim of report.source.limitations) {
      lines.push(`- ⚠️ ${lim}`);
    }
  }
  lines.push(``);

  lines.push(`## 3. Coverage Summary`);
  lines.push(``);
  lines.push(`| Metric | Count |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Total Files | ${report.coverage.totalFiles} |`);
  lines.push(`| Compared Files | ${report.coverage.comparedFiles} |`);
  lines.push(`| Skipped Files | ${report.coverage.skippedFiles} |`);
  lines.push(`| Findings Count | ${report.findings.length} |`);
  lines.push(``);

  if (report.coverage.reasons.length > 0) {
    lines.push(`### Coverage Limitations & Skipped Reasons`);
    for (const r of report.coverage.reasons) {
      lines.push(`- ⚠️ ${r}`);
    }
    lines.push(``);
  }

  lines.push(`## 4. Model Assessment`);
  lines.push(``);
  lines.push(
    `- **Model ID:** ${report.model.id ? `\`${report.model.id}\`` : "*None configured*"}`,
  );
  lines.push(`- **Model Status:** \`${report.model.status.toUpperCase()}\``);
  if (report.model.reason) {
    lines.push(`- **Context / Reason:** ${report.model.reason}`);
  }
  lines.push(``);

  lines.push(`## 5. Review Findings (${report.findings.length})`);
  lines.push(``);

  if (report.findings.length === 0) {
    lines.push(`*No findings reported for this package.*`);
    lines.push(``);
  } else {
    for (const finding of report.findings) {
      lines.push(`### [${finding.severity.toUpperCase()}] ${finding.title}`);
      lines.push(``);
      lines.push(`- **Finding ID:** \`${finding.id}\``);
      lines.push(`- **Rule ID:** \`${finding.ruleId}\``);
      lines.push(`- **Classification:** \`${finding.classification}\``);
      lines.push(`- **Confidence:** \`${finding.confidence.toUpperCase()}\``);
      lines.push(`- **Origin:** \`${finding.origin.toUpperCase()}\``);
      lines.push(``);
      lines.push(`**Explanation:**`);
      lines.push(finding.explanation);
      lines.push(``);

      if (finding.evidence.length > 0) {
        lines.push(`**Evidence Locations:**`);
        for (const ev of finding.evidence) {
          const linesDesc =
            ev.startLine !== undefined && ev.endLine !== undefined
              ? `lines ${ev.startLine}–${ev.endLine}`
              : `file-level`;
          lines.push(
            `- Side: \`${ev.side}\` (${linesDesc}) [File ID: \`${ev.fileId}\`]`,
          );
          if (ev.excerpt) {
            lines.push(`  \`\`\``);
            lines.push(`  ${ev.excerpt.trim()}`);
            lines.push(`  \`\`\``);
          }
        }
        lines.push(``);
      }

      if (finding.limitations.length > 0) {
        lines.push(`**Limitations:**`);
        for (const lim of finding.limitations) {
          lines.push(`- ⚠️ ${lim}`);
        }
        lines.push(``);
      }
      lines.push(`---`);
      lines.push(``);
    }
  }

  lines.push(`## 6. Files Inventory (${report.files.length})`);
  lines.push(``);
  lines.push(`| Status | Package Path | Source Path | Findings |`);
  lines.push(`| --- | --- | --- | --- |`);
  for (const f of report.files) {
    const pkg = f.packagePath ?? "—";
    const src = f.sourcePath ?? "—";
    lines.push(
      `| \`${f.status}\` | \`${pkg}\` | \`${src}\` | ${f.findingIds.length} |`,
    );
  }
  lines.push(``);

  lines.push(`## 7. Overall Model Summary`);
  lines.push(``);
  if (report.model.status === "used" && report.model.summary) {
    lines.push(`*Generated by ${report.model.id ?? "the configured model"}; unverified.*`);
    lines.push(``);
    lines.push(report.model.summary);
  } else {
    lines.push(`No model summary is available (${report.model.status}).`);
  }
  lines.push(``);

  lines.push(`---`);
  lines.push(
    `*Notice: Vajra reports explain differences backed by verifiable evidence. Completed analysis does not constitute a malware-free certification.*`,
  );

  return lines.join("\n");
}
