import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatDate,
  formatDuration,
  getClassificationLabel,
  getConfidenceMeta,
  getJobStatusBadge,
  getSeverityMeta,
  shortHash,
} from "../utils/formatters.js";

describe("Assignment C: Formatters & Accessibility", () => {
  it("severity labels include distinct text and symbols without relying only on color", () => {
    const high = getSeverityMeta("high");
    expect(high.badgeText).toBe("HIGH");
    expect(high.symbol).toBe("▲");
    expect(high.className).toContain("sev-high");

    const med = getSeverityMeta("medium");
    expect(med.badgeText).toBe("MEDIUM");
    expect(med.symbol).toBe("◆");

    const low = getSeverityMeta("low");
    expect(low.badgeText).toBe("LOW");
    expect(low.symbol).toBe("●");

    const info = getSeverityMeta("info");
    expect(info.badgeText).toBe("INFO");
    expect(info.symbol).toBe("○");
  });

  it("confidence metadata contains explicit text", () => {
    expect(getConfidenceMeta("high").badgeText).toBe("HIGH CONFIDENCE");
    expect(getConfidenceMeta("medium").badgeText).toBe("MED CONFIDENCE");
    expect(getConfidenceMeta("low").badgeText).toBe("LOW CONFIDENCE");
  });

  it("classifications have human-readable labels", () => {
    expect(getClassificationLabel("suspicious_change")).toBe(
      "Suspicious Change",
    );
    expect(getClassificationLabel("explained_packaging")).toBe(
      "Explained Packaging",
    );
    expect(getClassificationLabel("generated_unverified")).toBe(
      "Generated (Unverified)",
    );
    expect(getClassificationLabel("exact_match")).toBe("Exact Match");
    expect(getClassificationLabel("unresolved")).toBe("Unresolved Difference");
  });

  it("formats short hashes safely", () => {
    expect(
      shortHash(
        "874505386c056bd8ab3f747f5cdc958772f5a6a7e32cccb6324921531781fd25",
        8,
      ),
    ).toBe("87450538…1781fd25");
    expect(shortHash(null)).toBe("—");
    expect(shortHash(undefined)).toBe("—");
  });

  it("formats execution durations", () => {
    expect(formatDuration(150)).toBe("150ms");
    expect(formatDuration(1250)).toBe("1.25s");
  });

  it("formats byte sizes", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2097152)).toBe("2.0 MB");
  });

  it("formats ISO timestamps safely", () => {
    expect(formatDate("2026-10-31T00:00:00.000Z")).toBeDefined();
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });

  it("job status badges provide text labels and symbols", () => {
    expect(getJobStatusBadge("completed").label).toBe("COMPLETED");
    expect(getJobStatusBadge("partial").label).toBe("PARTIAL");
    expect(getJobStatusBadge("failed").label).toBe("FAILED");
  });
});
