import type { ApiError } from "@vajra/contracts";

export type IngestionErrorCode =
  | "NETWORK_ERROR"
  | "NETWORK_TIMEOUT"
  | "UNSUPPORTED_HOST"
  | "INTEGRITY_MISMATCH"
  | "UNSAFE_ARCHIVE_ENTRY"
  | "ARCHIVE_LIMIT_EXCEEDED"
  | "INVALID_ARCHIVE"
  | "INVALID_INPUT"
  | "UPLOAD_NOT_FOUND"
  | "NOT_FOUND"
  | "HTTP_ERROR";

export class IngestionError extends Error {
  public readonly code: IngestionErrorCode;
  public readonly retryable: boolean;

  constructor(
    code: IngestionErrorCode,
    message: string,
    retryable?: boolean,
  ) {
    super(message);
    this.name = "IngestionError";
    this.code = code;
    this.retryable =
      retryable !== undefined
        ? retryable
        : code === "NETWORK_ERROR" || code === "NETWORK_TIMEOUT";
  }

  toApiError(): ApiError {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    };
  }
}

