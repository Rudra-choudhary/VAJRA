import { describe, it, expect } from "vitest";
import { IngestionError } from "./errors.js";

describe("IngestionError", () => {
  it("defaults retryable correctly for retryable errors", () => {
    const netErr = new IngestionError("NETWORK_ERROR", "connection refused");
    expect(netErr.code).toBe("NETWORK_ERROR");
    expect(netErr.retryable).toBe(true);
    expect(netErr.name).toBe("IngestionError");
    expect(netErr.toApiError()).toEqual({
      code: "NETWORK_ERROR",
      message: "connection refused",
      retryable: true,
    });

    const timeoutErr = new IngestionError("NETWORK_TIMEOUT", "timed out after 30s");
    expect(timeoutErr.code).toBe("NETWORK_TIMEOUT");
    expect(timeoutErr.retryable).toBe(true);
  });

  it("defaults retryable to false for non-retryable errors", () => {
    const hostErr = new IngestionError("UNSUPPORTED_HOST", "evil.com not allowed");
    expect(hostErr.code).toBe("UNSUPPORTED_HOST");
    expect(hostErr.retryable).toBe(false);

    const integrityErr = new IngestionError("INTEGRITY_MISMATCH", "hash does not match");
    expect(integrityErr.code).toBe("INTEGRITY_MISMATCH");
    expect(integrityErr.retryable).toBe(false);

    const unsafeErr = new IngestionError("UNSAFE_ARCHIVE_ENTRY", "symlink forbidden");
    expect(unsafeErr.retryable).toBe(false);

    const limitErr = new IngestionError("ARCHIVE_LIMIT_EXCEEDED", "too large");
    expect(limitErr.retryable).toBe(false);

    const invalidArchErr = new IngestionError("INVALID_ARCHIVE", "corrupted gzip");
    expect(invalidArchErr.retryable).toBe(false);

    const inputErr = new IngestionError("INVALID_INPUT", "bad version format");
    expect(inputErr.retryable).toBe(false);

    const uploadErr = new IngestionError("UPLOAD_NOT_FOUND", "missing file");
    expect(uploadErr.retryable).toBe(false);

    const notFoundErr = new IngestionError("NOT_FOUND", "404 Not Found");
    expect(notFoundErr.retryable).toBe(false);

    const httpErr = new IngestionError("HTTP_ERROR", "400 Bad Request");
    expect(httpErr.retryable).toBe(false);
  });

  it("allows explicit override of retryable", () => {
    const http500 = new IngestionError("HTTP_ERROR", "500 Internal Server Error", true);
    expect(http500.code).toBe("HTTP_ERROR");
    expect(http500.retryable).toBe(true);

    const nonRetryableNet = new IngestionError("NETWORK_ERROR", "permanent failure", false);
    expect(nonRetryableNet.retryable).toBe(false);
  });
});

