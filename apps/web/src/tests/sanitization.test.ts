import { describe, expect, it } from "vitest";
import { escapeHtml, renderSafeMarkdown } from "../utils/sanitize.js";
import React from "react";

describe("Assignment C: Safe Text & Escaped Repository Rendering", () => {
  it("escapes raw HTML characters safely", () => {
    const malicious = '<script>alert("xss")</script>';
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toContain("<script>");
    expect(escaped).toContain("&lt;script&gt;");
    expect(escaped).toContain("&quot;xss&quot;");
  });

  it("safely tokenizes markdown without using dangerouslySetInnerHTML", () => {
    const markdown = [
      "### Finding Analysis",
      "The published package introduces **lifecycle script** hooks:",
      "- `preinstall` executes bash command",
      "- outbound network fetch observed",
      "",
      "> Sensitive data may be leaked",
      "",
      "```js",
      "const secret = process.env.API_KEY;",
      "```",
    ].join("\n");

    const element = renderSafeMarkdown(markdown) as React.ReactElement;
    expect(element).toBeDefined();
    expect(element.props.className).toBe("safe-md-container");
    expect(React.isValidElement(element)).toBe(true);
  });

  it("renders untrusted text nodes directly without executing scripts", () => {
    const dangerous = '<img src="x" onerror="evil()"/>';
    const element = renderSafeMarkdown(dangerous) as React.ReactElement;
    expect(element).toBeDefined();
    expect(React.isValidElement(element)).toBe(true);
    // Does not have dangerouslySetInnerHTML prop
    expect(element.props.dangerouslySetInnerHTML).toBeUndefined();
  });
});
