import { describe, it, expect } from "vitest";
import {
  validateUrl,
  validateCommit,
  parseGithubRepoUrl,
  validateArchivePath,
  normalizePathKey,
  HTTPS_ALLOWLIST,
} from "./validate.js";

describe("validateUrl", () => {
  it("accepts allowlisted HTTPS URLs without port/creds", () => {
    for (const host of HTTPS_ALLOWLIST) {
      const parsed = validateUrl(`https://${host}/path/to/resource`);
      expect(parsed.hostname).toBe(host);
      expect(parsed.protocol).toBe("https:");
    }
  });

  it("rejects non-https protocols", () => {
    expect(() => validateUrl("http://registry.npmjs.org/pkg")).toThrowError(
      expect.objectContaining({ code: "UNSUPPORTED_HOST" }),
    );
    expect(() => validateUrl("ftp://registry.npmjs.org/pkg")).toThrowError(
      expect.objectContaining({ code: "UNSUPPORTED_HOST" }),
    );
  });

  it("rejects hosts not in allowlist", () => {
    expect(() => validateUrl("https://malicious.com/tarball.tgz")).toThrowError(
      expect.objectContaining({ code: "UNSUPPORTED_HOST" }),
    );
    expect(() => validateUrl("https://localhost/pkg")).toThrowError(
      expect.objectContaining({ code: "UNSUPPORTED_HOST" }),
    );
    expect(() => validateUrl("https://127.0.0.1/pkg")).toThrowError(
      expect.objectContaining({ code: "UNSUPPORTED_HOST" }),
    );
  });

  it("rejects custom ports", () => {
    expect(() => validateUrl("https://registry.npmjs.org:8443/pkg")).toThrowError(
      expect.objectContaining({ code: "UNSUPPORTED_HOST" }),
    );
  });

  it("rejects embedded credentials", () => {
    expect(() => validateUrl("https://user:pass@registry.npmjs.org/pkg")).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  it("rejects malformed URLs", () => {
    expect(() => validateUrl("not a url")).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });
});

describe("validateCommit", () => {
  it("accepts valid 40-character lowercase hex SHAs", () => {
    const valid = "a".repeat(40);
    expect(validateCommit(valid)).toBe(valid);

    const mixedHex = "0123456789abcdef0123456789abcdef01234567";
    expect(validateCommit(mixedHex)).toBe(mixedHex);
  });

  it("rejects uppercase hex characters", () => {
    expect(() => validateCommit("A".repeat(40))).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  it("rejects short SHAs", () => {
    expect(() => validateCommit("a".repeat(7))).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  it("rejects branch names or tags", () => {
    expect(() => validateCommit("main")).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
    expect(() => validateCommit("v1.0.0")).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  it("rejects non-hex characters", () => {
    expect(() => validateCommit("g".repeat(40))).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });
});

describe("parseGithubRepoUrl", () => {
  it("parses valid github.com owner and repo names", () => {
    const res = parseGithubRepoUrl("https://github.com/facebook/react");
    expect(res).toEqual({
      owner: "facebook",
      repo: "react",
      normalizedUrl: "https://github.com/facebook/react",
    });
  });

  it("strips trailing .git and trailing slashes", () => {
    const res = parseGithubRepoUrl("https://github.com/owner/my-repo.git/");
    expect(res).toEqual({
      owner: "owner",
      repo: "my-repo",
      normalizedUrl: "https://github.com/owner/my-repo",
    });
  });

  it("rejects URLs with query strings or hash", () => {
    expect(() => parseGithubRepoUrl("https://github.com/owner/repo?ref=main")).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
    expect(() => parseGithubRepoUrl("https://github.com/owner/repo#readme")).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  it("rejects extra path segments", () => {
    expect(() => parseGithubRepoUrl("https://github.com/owner/repo/tree/main")).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  it("rejects URLs targeting non-github.com hosts", () => {
    expect(() => parseGithubRepoUrl("https://api.github.com/owner/repo")).toThrowError(
      expect.objectContaining({ code: "UNSUPPORTED_HOST" }),
    );
    expect(() => parseGithubRepoUrl("https://gitlab.com/owner/repo")).toThrowError(
      expect.objectContaining({ code: "UNSUPPORTED_HOST" }),
    );
  });
});

describe("validateArchivePath", () => {
  it("accepts valid POSIX logical paths within depth limit", () => {
    expect(validateArchivePath("index.js")).toBe("index.js");
    expect(validateArchivePath("src/components/Button.tsx")).toBe("src/components/Button.tsx");
    expect(validateArchivePath("a/b/c/d/e/file.txt")).toBe("a/b/c/d/e/file.txt");
  });

  it("rejects empty paths", () => {
    expect(() => validateArchivePath("")).toThrowError(
      expect.objectContaining({ code: "UNSAFE_ARCHIVE_ENTRY" }),
    );
  });

  it("rejects absolute paths", () => {
    expect(() => validateArchivePath("/etc/passwd")).toThrowError(
      expect.objectContaining({ code: "UNSAFE_ARCHIVE_ENTRY" }),
    );
    expect(() => validateArchivePath("/index.js")).toThrowError(
      expect.objectContaining({ code: "UNSAFE_ARCHIVE_ENTRY" }),
    );
  });

  it("rejects backslashes and Windows drive colons", () => {
    expect(() => validateArchivePath("src\\index.js")).toThrowError(
      expect.objectContaining({ code: "UNSAFE_ARCHIVE_ENTRY" }),
    );
    expect(() => validateArchivePath("C:/file.js")).toThrowError(
      expect.objectContaining({ code: "UNSAFE_ARCHIVE_ENTRY" }),
    );
    expect(() => validateArchivePath("path:file")).toThrowError(
      expect.objectContaining({ code: "UNSAFE_ARCHIVE_ENTRY" }),
    );
  });

  it("rejects control characters and null bytes", () => {
    expect(() => validateArchivePath("src/null\0byte.js")).toThrowError(
      expect.objectContaining({ code: "UNSAFE_ARCHIVE_ENTRY" }),
    );
    expect(() => validateArchivePath("src/newline\n.js")).toThrowError(
      expect.objectContaining({ code: "UNSAFE_ARCHIVE_ENTRY" }),
    );
  });

  it("rejects path traversal and relative segments", () => {
    expect(() => validateArchivePath("../escape.js")).toThrowError(
      expect.objectContaining({ code: "UNSAFE_ARCHIVE_ENTRY" }),
    );
    expect(() => validateArchivePath("src/../../escape.js")).toThrowError(
      expect.objectContaining({ code: "UNSAFE_ARCHIVE_ENTRY" }),
    );
    expect(() => validateArchivePath("./index.js")).toThrowError(
      expect.objectContaining({ code: "UNSAFE_ARCHIVE_ENTRY" }),
    );
    expect(() => validateArchivePath("src//index.js")).toThrowError(
      expect.objectContaining({ code: "UNSAFE_ARCHIVE_ENTRY" }),
    );
  });

  it("rejects paths exceeding MAX_DEPTH (32 segments)", () => {
    const deepPath = Array.from({ length: 33 }, (_, i) => `dir${i}`).join("/") + "/file.js";
    expect(() => validateArchivePath(deepPath)).toThrowError(
      expect.objectContaining({ code: "ARCHIVE_LIMIT_EXCEEDED" }),
    );
  });
});

describe("normalizePathKey", () => {
  it("normalizes case and Unicode decomposition", () => {
    expect(normalizePathKey("README.md")).toBe("readme.md");
    // e + combining acute accent (\u0065\u0301) vs precomposed é (\u00e9)
    const decomposed = "cafe\u0301.js";
    const precomposed = "caf\u00e9.js";
    expect(normalizePathKey(decomposed)).toBe(normalizePathKey(precomposed));
  });
});
