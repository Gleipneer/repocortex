import path from "node:path";
import fs from "node:fs/promises";
import { getConfigPath } from "./loadConfig.js";
import { stableStringify } from "../core/stableJson.js";
import { writeFileAtomic } from "../core/io.js";
import { parseRepocortexConfig } from "../core/validate.js";

export interface InitOptions {
  projectRoot: string;
  repoRoot: string;
  outputDir: string;
  maxFiles?: number;
  maxBytes?: number;
  defaultAuditBudgetSek?: number;
  clockIso?: string;
  printPaths?: boolean;
  /** Path to config file (absolute or relative to projectRoot); default getConfigPath(projectRoot) */
  configPath?: string;
  /** Overwrite existing config; default false */
  force?: boolean;
}

const DEFAULT_MAX_FILES = 50_000;
const DEFAULT_MAX_BYTES = 2_000_000_000;
const DEFAULT_AUDIT_BUDGET_SEK = 3;

/**
 * Create repocortex.config.json. Uses atomic write. Does not overwrite unless force.
 */
export async function createConfig(options: InitOptions): Promise<string> {
  const projectRoot = path.resolve(options.projectRoot);
  const configPath = options.configPath
    ? path.resolve(projectRoot, options.configPath)
    : getConfigPath(projectRoot);

  if (!options.force) {
    try {
      await fs.access(configPath);
      throw new Error(`Config already exists at ${configPath}. Use --force to overwrite.`);
    } catch (err) {
      if (err instanceof Error && err.message.includes("--force")) throw err;
      // ENOENT = ok, proceed
    }
  }

  const repoRoot = options.repoRoot
    ? path.relative(projectRoot, path.resolve(projectRoot, options.repoRoot)) || "."
    : ".";
  const outputDir = options.outputDir
    ? path.relative(projectRoot, path.resolve(projectRoot, options.outputDir)) || "./storage"
    : "./storage";

  const config = {
    schemaVersion: "1.0" as const,
    repoRoot,
    outputDir,
    maxFiles: options.maxFiles ?? DEFAULT_MAX_FILES,
    maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
    defaultAuditBudgetSek: options.defaultAuditBudgetSek ?? DEFAULT_AUDIT_BUDGET_SEK,
    ...(options.clockIso !== undefined && { clockIso: options.clockIso }),
    printPaths: options.printPaths ?? true
  };

  const content = stableStringify(config) + "\n";
  parseRepocortexConfig(config); // validate before write
  await writeFileAtomic(configPath, content);
  return configPath;
}
