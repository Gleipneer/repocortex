import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { ensureDir, validateOrThrow, writeJsonAtomic } from "../core/io.js";
import { ContractsSnapshotSchema } from "../schemas/contractsSnapshot.schema.js";

const SNAPSHOT_FILE = "contracts/contracts_snapshot.json";

function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Read package.json version from project root (cwd or parent of src).
 */
async function getRepocortexVersion(projectRoot: string): Promise<string> {
  const pkgPath = path.join(projectRoot, "package.json");
  try {
    const raw = await fs.readFile(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * List .ts files in dir (flat), sorted.
 */
async function listTsFiles(dir: string): Promise<string[]> {
  const names: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith(".ts")) names.push(e.name);
    }
  } catch {
    // ignore
  }
  return names.sort();
}

/**
 * Hash each schema file; return record of filename -> sha256.
 */
async function hashSchemaFiles(projectRoot: string): Promise<Record<string, string>> {
  const schemasDir = path.join(projectRoot, "src", "schemas");
  const out: Record<string, string> = {};
  const files = await listTsFiles(schemasDir);
  for (const f of files) {
    const full = path.join(schemasDir, f);
    const content = await fs.readFile(full, "utf8");
    out[f] = sha256Hex(content);
  }
  return out;
}

/**
 * Hash CLI source folder: concat all .ts file contents in sorted order, then sha256.
 */
async function hashCliSource(projectRoot: string): Promise<string> {
  const cliDir = path.join(projectRoot, "src", "cli");
  const files = await listTsFiles(cliDir);
  const parts: string[] = [];
  for (const f of files) {
    const full = path.join(cliDir, f);
    const content = await fs.readFile(full, "utf8");
    parts.push(content);
  }
  return sha256Hex(parts.join("\n"));
}

/**
 * Build and write contracts snapshot. Deterministic when timestamp is fixed.
 */
export async function runSnapshotContracts(
  outputDir: string,
  projectRoot: string,
  timestamp: string
): Promise<string> {
  const root = path.resolve(projectRoot);
  const [repocortexVersion, schemaHashes, cliSourceHash] = await Promise.all([
    getRepocortexVersion(root),
    hashSchemaFiles(root),
    hashCliSource(root)
  ]);

  const snapshot = validateOrThrow(ContractsSnapshotSchema, {
    schemaVersion: "1.0",
    repocortexVersion,
    nodeVersion: process.version,
    timestamp,
    schemaHashes,
    cliSourceHash
  });

  const outAbs = path.resolve(outputDir);
  const outPath = path.join(outAbs, SNAPSHOT_FILE);
  await ensureDir(path.dirname(outPath));
  await writeJsonAtomic(outPath, snapshot, outputDir);
  return outPath;
}
