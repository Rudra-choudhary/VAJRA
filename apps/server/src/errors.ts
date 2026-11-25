import type { FastifyReply } from "fastify";
import type { ApiError } from "@vajra/contracts";
import { IngestionError } from "@vajra/ingestion";

/**
 * Sets the HTTP status code on the Fastify reply and returns a standardized
 * API error envelope.
 */
export function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  retryable = false,
): { error: ApiError } {
  reply.code(statusCode);
  return {
    error: {
      code,
      message,
      retryable,
    },
  };
}

/**
 * Normalizes an unknown thrown error from the analysis pipeline into a
 * structured ApiError.
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof IngestionError) {
    return error.toApiError();
  }
  if (error instanceof Error) {
    const errWithMeta = error as Error & {
      code?: unknown;
      retryable?: unknown;
    };
    return {
      code:
        typeof errWithMeta.code === "string"
          ? errWithMeta.code
          : "ANALYSIS_FAILED",
      message: error.message || "failed",
      retryable: Boolean(errWithMeta.retryable),
    };
  }
  return {
    code: "ANALYSIS_FAILED",
    message: "failed",
    retryable: false,
  };
}
