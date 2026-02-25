import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import fg from "fast-glob";
import Ignore from "ignore";
import type { FileIndex, FileRecord } from "../schemas/fileIndex.schema.js";
import { sha256 } from "../core/hash.js";
import { writeJsonAtomic } from "../core/io.js";
import { stableStringify } from "../core/stableJson.js";
import { getStoragePaths } from "../utils/paths.js";

const DEFAULT_IGNORE = ["node_modules", ".git", "dist", "coverage", "out", "rc-analysis", "storage", "*.tmp", ".tmp"];

const LANG_BY_EXT: Record<string, string> = {
  ".ts": "ts",
  ".js": "js",
  ".mjs": "js",
  ".cjs": "js",
  ".json": "json",
  ".md": "md",
  ".yml": "yml",
  ".yaml": "yaml"
};

function langFromPath(filePath: string): string {
  const ext = filePath.replace(/^.*\./, ".");
  return LANG_BY_EXT[ext] ?? "unknown";
}

function isBinaryPath(filePath: string): boolean {
  const ext = filePath.replace(/^.*\./, ".").toLowerCase();
  const binary = [".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".pdf"];
  return binary.includes(ext);
}

const DEFAULT_MAX_FILES = 50_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

export interface ScanOptions {
  repoRoot: string;
  outputDir: string;
  clock: { nowIso: () => string };
  ignore?: string[];
  /** Override max file count; over this requires --force. Default 50000. */
  maxFiles?: number;
  /** Override max total bytes; over this requires --force. Default 2GB. */
  maxBytes?: number;
  /** If true, skip hard guard (allow over maxFiles/maxBytes). */
  force?: boolean;
}

export interface ScanResult {
  inputHash: string;
  snapshotId: string;
  fileIndex: FileIndex;
}

export async function scanRepo(options: ScanOptions): Promise<ScanResult> {
  const { repoRoot, outputDir, clock } = options;
  const root = resolve(repoRoot);
  const ignoreList = options.ignore ?? DEFAULT_IGNORE;
  const ig = Ignore().add(ignoreList);

  const rawPaths = await fg("**/*", {
    cwd: root,
    dot: false,
    onlyFiles: true,
    followSymbolicLinks: false
  });

  const allowed = rawPaths.filter((p) => !ig.ignores(p));
  const sortedPaths = [...allowed].sort();

  const files: FileRecord[] = [];
  let totalBytes = 0;

  for (const p of sortedPaths) {
    const abs = resolve(root, p);
    const st = await stat(abs);
    if (!st.isFile()) continue;

    const bytes = st.size;
    const lang = langFromPath(p);
    const isBinary = isBinaryPath(p);

    let fileSha256: string;
    if (isBinary) {
      const buf = await readFile(abs);
      fileSha256 = sha256(buf);
    } else {
      const content = await readFile(abs, "utf8");
      fileSha256 = sha256(content);
    }

    const pathPosix = p.split("\\").join("/");
    files.push({
      path: pathPosix,
      bytes,
      sha256: fileSha256,
      lang,
      isBinary
    });
    totalBytes += bytes;
  }

  const fileCount = files.length;
  const generatedAtIso = clock.nowIso();

  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const force = options.force ?? false;

  if (fileCount > maxFiles || totalBytes > maxBytes) {
    console.warn(
      `repocortex: repo exceeds limits (${fileCount} files, ${(totalBytes / 1024 / 1024).toFixed(1)} MB). Limits: --max-files ${maxFiles}, --max-bytes ${(maxBytes / 1024 / 1024).toFixed(0)} MB. Use --force to run anyway.`
    );
    if (!force) {
      throw new Error(
        `Repo exceeds safety limits (${fileCount} files, ${(totalBytes / 1024 / 1024).toFixed(1)} MB). Use --force to run anyway.`
      );
    }
  }

  const PERF_WARN_FILES = 10_000;
  const PERF_WARN_BYTES = 50 * 1024 * 1024;
  if (fileCount > PERF_WARN_FILES || totalBytes > PERF_WARN_BYTES) {
    console.warn(
      `repocortex: large repo (${fileCount} files, ${(totalBytes / 1024 / 1024).toFixed(1)} MB); run may be slow.`
    );
  }

  const deterministicPayload = stableStringify(
    files.map((f) => ({
      path: f.path,
      bytes: f.bytes,
      sha256: f.sha256,
      lang: f.lang,
      isBinary: f.isBinary
    }))
  );
  const inputHash = sha256(deterministicPayload);
  const snapshotId = inputHash.slice(0, 12);

  const fileIndex: FileIndex = {
    schemaVersion: "1.0",
    repoRoot: root,
    generatedAtIso,
    files,
    totals: { fileCount, totalBytes }
  };

  const paths = getStoragePaths(outputDir, snapshotId);
  await writeJsonAtomic(paths.fileIndex, fileIndex, outputDir);

  return { inputHash, snapshotId, fileIndex };
}
