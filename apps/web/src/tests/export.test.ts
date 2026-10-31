import { describe, expect, it } from "vitest";
import { generateMarkdownReport } from "../utils/markdownExport.js";
import { FIXTURES } from "../api/fixtures/index.js";

describe("Assignment C: Report Export", () => {
  it("generates markdown report containing all required contract fields", () => {
    const report = FIXTURES.suspicious.job.report!;
    const md = generateMarkdownReport(report);

    expect(md).toContain("# Vajra Package Integrity Review Report");
    expect(md).toContain(`**Report ID:** \`${report.id}\``);
    expect(md).toContain(`**Status:** \`${report.status.toUpperCase()}\``);
    expect(md).toContain(`**Package Name:** \`${report.artifact.name}\``);
    expect(md).toContain(`**Artifact SHA-256:** \`${report.artifact.sha256}\``);
    expect(md).toContain(`**Resolution Method:** \`${report.source.method}\``);
    expect(md).toContain(
      `**Model Status:** \`${report.model.status.toUpperCase()}\``,
    );
    expect(md).toContain(`Compared Files | ${report.coverage.comparedFiles}`);
    expect(md).toContain(`Findings Count | ${report.findings.length}`);

    // Findings section
    for (const f of report.findings) {
      expect(md).toContain(`[${f.severity.toUpperCase()}] ${f.title}`);
      expect(md).toContain(f.id);
      expect(md).toContain(f.classification);
    }

    // Files inventory
    expect(md).toContain("## 6. Files Inventory");
  });

  it("does not include invented security scores or progress percentages in markdown export", () => {
    const report = FIXTURES.clean.job.report!;
    const md = generateMarkdownReport(report);

    expect(md).not.toMatch(/security score/i);
    expect(md).not.toMatch(/risk score/i);
    expect(md).not.toMatch(/\d+%\s*safe/i);
  });
});
