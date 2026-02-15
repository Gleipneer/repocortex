import fs from "node:fs/promises";
import path from "node:path";
import { ConfigSchema, type RepoCortexConfig } from "../schemas/config.schema.js";
import type { MergedConfig } from "../schemas/repocortexConfig.schema.js";
import { getStorageRoot } from "../utils/paths.js";
import { validateOrThrow, writeFileAtomic } from "./io.js";

export type ConfigLoadParams = {
  configPath: string;
};

export async function loadConfigOrNull(configPath: string): Promise<RepoCortexConfig | null> {
  try {
    const txt = await fs.readFile(configPath, "utf8");
    const json = JSON.parse(txt) as unknown;
    return validateOrThrow(ConfigSchema, json) as RepoCortexConfig;
  } catch (e: unknown) {
    if (String((e as NodeJS.ErrnoException)?.code) === "ENOENT") return null;
    throw e;
  }
}

export function resolveConfigPath(cliConfigPath?: string): string {
  return path.resolve(cliConfigPath ?? "repocortex.config.json");
}

/** Merge base config with env and CLI overrides (config-level only; paths stay relative). */
export function mergeConfigLayers(params: {
  base: RepoCortexConfig;
  env: { outputDir?: string; clockIso?: string };
  cli: Partial<RepoCortexConfig>;
}): RepoCortexConfig {
  const envOnly: { outputDir?: string; clockIso?: string } = {};
  if (params.env.outputDir !== undefined) envOnly.outputDir = params.env.outputDir;
  if (params.env.clockIso !== undefined) envOnly.clockIso = params.env.clockIso;
  const cliOnly: Partial<RepoCortexConfig> = {};
  if (params.cli.repoRoot !== undefined) cliOnly.repoRoot = params.cli.repoRoot;
  if (params.cli.outputDir !== undefined) cliOnly.outputDir = params.cli.outputDir;
  if (params.cli.maxFiles !== undefined) cliOnly.maxFiles = params.cli.maxFiles;
  if (params.cli.maxBytes !== undefined) cliOnly.maxBytes = params.cli.maxBytes;
  if (params.cli.printPaths !== undefined) cliOnly.printPaths = params.cli.printPaths;
  if (params.cli.clockIso !== undefined) cliOnly.clockIso = params.cli.clockIso;
  const outputDir = cliOnly.outputDir ?? envOnly.outputDir ?? params.base.outputDir ?? "./storage";
  const maxFiles = cliOnly.maxFiles ?? params.base.maxFiles ?? 50000;
  const maxBytes = cliOnly.maxBytes ?? params.base.maxBytes ?? 2_000_000_000;
  const printPaths = cliOnly.printPaths ?? params.base.printPaths ?? true;
  const repoRoot = cliOnly.repoRoot ?? params.base.repoRoot;
  const clockIso = cliOnly.clockIso ?? envOnly.clockIso ?? params.base.clockIso;
  const merged: RepoCortexConfig = {
    schemaVersion: "1.0",
    repoRoot,
    outputDir,
    maxFiles,
    maxBytes,
    printPaths,
    ...(clockIso !== undefined && { clockIso }),
    ...(params.base.defaultAuditBudgetSek !== undefined && {
      defaultAuditBudgetSek: params.base.defaultAuditBudgetSek
    })
  };
  return validateOrThrow(ConfigSchema, merged) as RepoCortexConfig;
}

export async function writeConfigAtomic(
  configPath: string,
  config: RepoCortexConfig
): Promise<void> {
  const validated = validateOrThrow(ConfigSchema, config);
  await writeFileAtomic(configPath, JSON.stringify(validated, null, 2) + "\n");
}

// --- Backward compatibility for CLI (path-resolving merge) ---

export interface ConfigOverrides {
  repoRoot?: string;
  outputDir?: string;
  maxFiles?: number;
  maxBytes?: number;
  clockIso?: string;
  printPaths?: boolean;
}

/**
 * Merge config with overrides and resolve paths. Priority: CLI > ENV > config.
 * Returns MergedConfig with absolute repoRoot and outputDir.
 */
export function mergeConfig(
  config: RepoCortexConfig,
  projectRoot: string,
  overrides: ConfigOverrides
): MergedConfig {
  const envStorage = process.env["REPOCORTEX_STORAGE"];
  const envClock = process.env["REPOCORTEX_CLOCK_ISO"];
  const env: { outputDir?: string; clockIso?: string } = {};
  if (envStorage !== undefined) env.outputDir = envStorage;
  if (envClock !== undefined) env.clockIso = envClock;
  const cli: Partial<RepoCortexConfig> = {};
  if (overrides.outputDir !== undefined) cli.outputDir = overrides.outputDir;
  if (overrides.maxFiles !== undefined) cli.maxFiles = overrides.maxFiles;
  if (overrides.maxBytes !== undefined) cli.maxBytes = overrides.maxBytes;
  if (overrides.clockIso !== undefined) cli.clockIso = overrides.clockIso;
  if (overrides.printPaths !== undefined) cli.printPaths = overrides.printPaths;
  const merged = mergeConfigLayers({ base: config, env, cli });
  const outputDir =
    overrides.outputDir !== undefined
      ? path.resolve(projectRoot, overrides.outputDir)
      : envStorage
        ? path.resolve(envStorage)
        : path.resolve(projectRoot, merged.outputDir ?? "./storage");
  const repoRoot =
    overrides.repoRoot !== undefined
      ? path.resolve(projectRoot, overrides.repoRoot)
      : path.resolve(projectRoot, merged.repoRoot ?? ".");
  return {
    repoRoot,
    outputDir,
    maxFiles: merged.maxFiles ?? 50000,
    maxBytes: merged.maxBytes ?? 2_000_000_000,
    clockIso: merged.clockIso,
    printPaths: merged.printPaths ?? true
  };
}

/** Default output dir when no config. */
export function getDefaultOutputDir(): string {
  return getStorageRoot();
}
