import { createHash } from "node:crypto";
import {
  HashSchema,
  LogicalPathSchema,
  PackageRootSchema,
  type Snapshot,
  type TextContent,
  type Limits,
} from "@vajra/contracts";

export const DEFAULT_LIMITS: Readonly<Limits> = Object.freeze({
  maxEntries: 10000,
  maxFindings: 1000,
  maxTextBytes: 512 * 1024,
  maxTotalTextBytes: 8 * 1024 * 1024,
  maxModelInputChars: 24000,
  maxModelFiles: 12,
  maxDiffChars: 64000,
  maxModelOutputBytes: 64000,
});
export class EngineError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "EngineError";
  }
}
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export const stableId = (prefix: string, s: string) =>
  `${prefix}_${digest(s).slice(0, 24)}`;
export function checkSnapshot(snapshot: Snapshot, limits: Limits): void {
  HashSchema.parse(snapshot.sha256);
  if (snapshot.entries.length > limits.maxEntries)
    throw new EngineError("LIMIT_EXCEEDED", "Snapshot has too many entries");
  const seen = new Set<string>();
  for (const e of snapshot.entries) {
    LogicalPathSchema.parse(e.path);
    HashSchema.parse(e.sha256);
    if (!Number.isSafeInteger(e.sizeBytes) || e.sizeBytes < 0)
      throw new EngineError("INVALID_SNAPSHOT", "Invalid entry size");
    if (seen.has(e.path))
      throw new EngineError("INVALID_SNAPSHOT", "Duplicate snapshot path");
    seen.add(e.path);
  }
}
export function within(path: string, root: string): string | null {
  PackageRootSchema.parse(root);
  return root === ""
    ? path
    : path.startsWith(root + "/")
      ? path.slice(root.length + 1)
      : null;
}
export const joinRoot = (root: string, path: string) =>
  root ? `${root}/${path}` : path;
export class ContentReader {
  private cache = new WeakMap<Snapshot, Map<string, TextContent>>();
  private used = 0;
  readonly limitations = new Set<string>();
  constructor(
    private limits: Limits,
    private signal: AbortSignal,
  ) {}
  async read(s: Snapshot, path: string): Promise<TextContent> {
    this.signal.throwIfAborted();
    let cache = this.cache.get(s);
    if (!cache) {
      cache = new Map();
      this.cache.set(s, cache);
    }
    const old = cache.get(path);
    if (old) return old;
    const entry = s.entries.find((e) => e.path === path);
    if (!entry)
      throw new EngineError(
        "INVALID_SNAPSHOT",
        "Requested entry does not exist",
      );
    const budget = Math.min(
      this.limits.maxTextBytes,
      this.limits.maxTotalTextBytes - this.used,
    );
    if (budget <= 0) {
      this.limitations.add("Total text inspection budget exhausted");
      return { text: null, binary: false, truncated: true };
    }
    const c = await s.readText(path, budget, this.signal);
    this.signal.throwIfAborted();
    const bytes = c.text === null ? 0 : Buffer.byteLength(c.text, "utf8");
    if (bytes > budget)
      throw new EngineError(
        "INVALID_ADAPTER",
        "Text reader exceeded the requested byte limit",
      );
    if (
      !c.binary &&
      !c.truncated &&
      c.text !== null &&
      digest(c.text) !== entry.sha256
    )
      throw new EngineError(
        "INVALID_SNAPSHOT",
        "Text content does not match its recorded hash",
      );
    this.used += bytes;
    cache.set(path, c);
    return c;
  }
  async manifest(
    s: Snapshot,
    path: string,
  ): Promise<Record<string, unknown> | null> {
    if (!s.entries.some((e) => e.path === path)) return null;
    const c = await this.read(s, path);
    if (c.text === null || c.truncated) return null;
    try {
      const m: unknown = JSON.parse(c.text);
      return m !== null && typeof m === "object" && !Array.isArray(m)
        ? (m as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
}
