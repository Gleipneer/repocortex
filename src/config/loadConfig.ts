import path from "node:path";
import fs from "node:fs/promises";
import { parseRepocortexConfig } from "../core/validate.js";
import { SUPPORTED_SCHEMA_VERSION } from "../schemas/version.js";

const CONFIG_FILENAME = "repocortex.config.json";

/**
 * Resolve path to config file in project root (cwd).
 */
export function getConfigPath(projectRoot: string): string {
  return path.resolve(projectRoot, CONFIG_FILENAME);
}

/**
 * Load and validate config from project root. Throws if file missing or invalid.
 * Refuses schemaVersion !== "1.0".
 */
export async function loadConfig(projectRoot: string): Promise<{
  repoRoot: string;
  outputDir: string;
  maxFiles: number;
  maxBytes: number;
  defaultAuditBudgetSek: number;
  clockIso?: string;
  printPaths: boolean;
}> {
  const configPath = getConfigPath(projectRoot);
  let raw: unknown;
  try {
    const content = await fs.readFile(configPath, "utf8");
    raw = JSON.parse(content) as unknown;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      throw new Error(`Config not found at ${configPath}. Run 'repocortex init' first.`);
    }
    throw err;
  }

  const config = parseRepocortexConfig(raw);
  if (config.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported config schemaVersion "${config.schemaVersion}"; supported: ${SUPPORTED_SCHEMA_VERSION}`
    );
  }

  const repoRoot = path.resolve(projectRoot, config.repoRoot || ".");
  const outputDir = path.resolve(projectRoot, config.outputDir || "./storage");

  const result: {
    repoRoot: string;
    outputDir: string;
    maxFiles: number;
    maxBytes: number;
    defaultAuditBudgetSek: number;
    clockIso?: string;
    printPaths: boolean;
  } = {
    repoRoot,
    outputDir,
    maxFiles: config.maxFiles,
    maxBytes: config.maxBytes,
    defaultAuditBudgetSek: config.defaultAuditBudgetSek ?? 3,
    printPaths: config.printPaths ?? true
  };
  if (config.clockIso !== undefined) result.clockIso = config.clockIso;
  return result;
}

/**
 * Check if config file exists in project root.
 */
export async function configExists(projectRoot: string): Promise<boolean> {
  const configPath = getConfigPath(projectRoot);
  try {
    await fs.access(configPath);
    return true;
  } catch {
    return false;
  }
}
