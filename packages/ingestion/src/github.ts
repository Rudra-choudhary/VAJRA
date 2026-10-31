import type {
  SourceSnapshot,
  AdapterContext,
} from "@vajra/contracts";
import { IngestionError } from "./errors.js";

/**
 * Fetch a GitHub snapshot for a given repository and commit.
 *
 * NOTE: Typed stub for Assignment B-1.
 * Live GitHub snapshot retrieval is scheduled for Assignment B-2.
 */
export async function fetchGithubSnapshot(
  _input: { repositoryUrl: string; commit: string },
  _context: AdapterContext,
): Promise<SourceSnapshot> {
  throw new IngestionError(
    "NOT_FOUND",
    "fetchGithubSnapshot is not implemented until B-2",
    false,
  );
}

/**
 * Resolve a mutable Git reference (such as a tag) to an exact commit SHA.
 *
 * NOTE: Typed stub for Assignment B-1.
 * Live GitHub ref resolution is scheduled for Assignment B-2.
 */
export async function resolveGithubRef(
  _input: { repositoryUrl: string; ref: string },
  _context: AdapterContext,
): Promise<string | null> {
  throw new IngestionError(
    "NOT_FOUND",
    "resolveGithubRef is not implemented until B-2",
    false,
  );
}

