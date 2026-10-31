import React from "react";

/**
 * Escapes characters that could be interpreted as HTML.
 * Used for pure text output in tooltips, attributes, and text nodes.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Safely parses markdown-like explanation text into standard React elements.
 * Strictly avoids `dangerouslySetInnerHTML`.
 * Supports headings, blockquotes, code blocks, unordered lists, bold, italics, inline code, and paragraphs.
 */
export function renderSafeMarkdown(content: string): React.ReactNode {
  if (!content) return null;

  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let listItems: string[] = [];

  const flushList = (key: string) => {
    if (listItems.length > 0) {
      nodes.push(
        <ul key={key} className="safe-md-list">
          {listItems.map((item, idx) => (
            <li key={idx}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>,
      );
      listItems = [];
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Code block toggle
    if (trimmed.startsWith("```")) {
      flushList(`list-before-code-${index}`);
      if (inCodeBlock) {
        // End code block
        nodes.push(
          <pre key={`code-${index}`} className="safe-md-pre">
            <code>{codeBlockLines.join("\n")}</code>
          </pre>,
        );
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      return;
    }

    // List item
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      listItems.push(trimmed.slice(2));
      return;
    } else {
      flushList(`list-${index}`);
    }

    // Empty line
    if (!trimmed) {
      return;
    }

    // Headings
    if (trimmed.startsWith("### ")) {
      nodes.push(
        <h4 key={`h4-${index}`} className="safe-md-h4">
          {renderInlineMarkdown(trimmed.slice(4))}
        </h4>,
      );
      return;
    }
    if (trimmed.startsWith("## ")) {
      nodes.push(
        <h3 key={`h3-${index}`} className="safe-md-h3">
          {renderInlineMarkdown(trimmed.slice(3))}
        </h3>,
      );
      return;
    }
    if (trimmed.startsWith("# ")) {
      nodes.push(
        <h2 key={`h2-${index}`} className="safe-md-h2">
          {renderInlineMarkdown(trimmed.slice(2))}
        </h2>,
      );
      return;
    }

    // Blockquote
    if (trimmed.startsWith("> ")) {
      nodes.push(
        <blockquote key={`quote-${index}`} className="safe-md-quote">
          {renderInlineMarkdown(trimmed.slice(2))}
        </blockquote>,
      );
      return;
    }

    // Standard paragraph
    nodes.push(
      <p key={`p-${index}`} className="safe-md-p">
        {renderInlineMarkdown(trimmed)}
      </p>,
    );
  });

  flushList("list-end");
  if (inCodeBlock && codeBlockLines.length > 0) {
    nodes.push(
      <pre key="code-end" className="safe-md-pre">
        <code>{codeBlockLines.join("\n")}</code>
      </pre>,
    );
  }

  return <div className="safe-md-container">{nodes}</div>;
}

/**
 * Safely parses inline markdown tokens: `code`, **bold**, *italic*.
 */
export function renderInlineMarkdown(text: string): React.ReactNode {
  // Regex splits on `code`, **bold**, *italic*
  const parts: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code key={key++} className="safe-md-code">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={key++} className="safe-md-strong">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(
        <em key={key++} className="safe-md-em">
          {token.slice(1, -1)}
        </em>,
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? (
    parts[0]
  ) : (
    <React.Fragment>{parts}</React.Fragment>
  );
}
