import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { ZodType } from "zod";
import { getStorageRoot } from "../utils/paths.js";
import { stableStringify } from "./stableJson.js";

/**
 * Default output directory for all writes. Read-only input repo must never be written to.
 */
export function getOutputDir(override?: string): string {
  return getStorageRoot(override);
}

/**
 * Create directory and parents. Idempotent.
 */
export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/**
 * Assert that canonicalPath is under outputDir. Throws if escape attempt.
 */
function assertUnderOutputDir(outputDir: string, canonicalPath: string): void {
  const out = resolve(outputDir);
  const target = resolve(canonicalPath);
  const rel = relative(out, target);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Path must be under outputDir: ${canonicalPath}`);
  }
}

/**
 * Write file atomically: write to path.tmp then rename. Use for config or any path (no outputDir check).
 */
export async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const absolutePath = resolve(filePath);
  await ensureDir(dirname(absolutePath));
  const tmpPath = absolutePath + ".tmp";
  await writeFile(tmpPath, content, "utf8");
  await rename(tmpPath, absolutePath);
}

/**
 * Write JSON atomically: stableStringify to .tmp then rename. Never leaves a half-written file.
 * filePath must be under outputDir (default ./storage or REPOCORTEX_STORAGE).
 */
export async function writeJsonAtomic(
  filePath: string,
  obj: unknown,
  outputDir?: string
): Promise<void> {
  const outDir = resolve(getOutputDir(outputDir));
  const absolutePath = resolve(filePath);
  assertUnderOutputDir(outDir, absolutePath);

  await ensureDir(dirname(absolutePath));
  const tmpPath = absolutePath + ".tmp";
  const json = stableStringify(obj);
  await writeFile(tmpPath, json, "utf8");
  await rename(tmpPath, absolutePath);
}

/**
 * Read file as UTF-8 text.
 */
export async function readText(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

/**
 * Read file and parse as JSON.
 */
export async function readJson(filePath: string): Promise<unknown> {
  const raw = await readText(filePath);
  return JSON.parse(raw) as unknown;
}

/**
 * Validate data against a Zod schema; throw on failure.
 */
export function validateOrThrow<T>(schema: ZodType<T>, data: unknown): T {
  return schema.parse(data);
}
