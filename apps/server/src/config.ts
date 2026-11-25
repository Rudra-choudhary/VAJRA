/**
 * Server configuration loaded and validated at startup (Fail-Fast).
 */
export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  readonly modelId: string;
  readonly ollamaUrl: string;
  readonly dbPath: string;
  readonly uploadDir: string;
  readonly workspaceDir: string;
}

function requireNonEmpty(name: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Invalid configuration: ${name} must not be empty`);
  }
  return trimmed;
}

/**
 * Parses and validates environment variables into a frozen ServerConfig.
 * Throws immediately on invalid port, URL, or empty paths.
 */
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): ServerConfig {
  const rawPort = env.PORT ?? "3000";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid configuration: PORT must be an integer between 1 and 65535, got "${rawPort}"`,
    );
  }

  const host = requireNonEmpty("HOST", env.HOST ?? "127.0.0.1");
  const modelId = env.VAJRA_MODEL?.trim() || "qwen3.5:latest";
  const rawOllamaUrl = env.VAJRA_OLLAMA_URL ?? "http://127.0.0.1:11434";
  try {
    new URL(rawOllamaUrl);
  } catch {
    throw new Error(
      `Invalid configuration: VAJRA_OLLAMA_URL is not a valid URL: "${rawOllamaUrl}"`,
    );
  }

  return Object.freeze({
    port,
    host,
    modelId,
    ollamaUrl: rawOllamaUrl,
    dbPath: requireNonEmpty("VAJRA_DB", env.VAJRA_DB ?? "./data/vajra.db"),
    uploadDir: requireNonEmpty(
      "VAJRA_UPLOADS",
      env.VAJRA_UPLOADS ?? "./data/uploads",
    ),
    workspaceDir: requireNonEmpty(
      "VAJRA_WORKSPACE",
      env.VAJRA_WORKSPACE ?? "./data/workspaces",
    ),
  });
}
