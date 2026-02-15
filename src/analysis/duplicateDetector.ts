import fs from "node:fs/promises";
import path from "node:path";
import type { FileIndex } from "../schemas/fileIndex.schema.js";
import { simhash64, hammingDistance } from "./simhash.js";
import { ensureDir, validateOrThrow, writeJsonAtomic } from "../core/io.js";
import { DuplicatesReportSchema } from "../schemas/duplicates.schema.js";

const HAMMING_THRESHOLD = 3;

const TEXT_LANGS = new Set(["ts", "js", "jsx", "tsx", "json", "md", "txt", "css", "html"]);

/**
 * Compute duplicates from file index and repo root. Reads file contents for text files.
 * Deterministic: sort by path before processing.
 */
export async function computeDuplicates(
  fileIndex: FileIndex,
  repoRoot: string
): Promise<
  { pathA: string; pathB: string; simhashA: string; simhashB: string; hamming: number }[]
> {
  const textFiles = fileIndex.files
    .filter((f) => !f.isBinary && TEXT_LANGS.has(f.lang))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const hashes: { path: string; hash: string }[] = [];
  for (const f of textFiles) {
    const full = path.join(repoRoot, f.path);
    let content: string;
    try {
      content = await fs.readFile(full, "utf8");
    } catch {
      continue;
    }
    const h = simhash64(content);
    hashes.push({ path: f.path, hash: h });
  }

  const pairs: {
    pathA: string;
    pathB: string;
    simhashA: string;
    simhashB: string;
    hamming: number;
  }[] = [];
  for (let i = 0; i < hashes.length; i++) {
    for (let j = i + 1; j < hashes.length; j++) {
      const a = hashes[i]!;
      const b = hashes[j]!;
      const d = hammingDistance(a.hash, b.hash);
      if (d <= HAMMING_THRESHOLD) {
        pairs.push({
          pathA: a.path,
          pathB: b.path,
          simhashA: a.hash,
          simhashB: b.hash,
          hamming: d
        });
      }
    }
  }
  pairs.sort((x, y) => {
    if (x.pathA !== y.pathA) return x.pathA < y.pathA ? -1 : 1;
    return x.pathB < y.pathB ? -1 : x.pathB > y.pathB ? 1 : 0;
  });
  return pairs;
}

export async function runDuplicateDetector(
  outputDir: string,
  repoRoot: string,
  fileIndex: FileIndex
): Promise<string> {
  const pairs = await computeDuplicates(fileIndex, repoRoot);
  const report = validateOrThrow(DuplicatesReportSchema, {
    schemaVersion: "1.0",
    pairs
  });
  await ensureDir(path.join(outputDir, "analysis"));
  const outPath = path.join(outputDir, "analysis", "duplicates.json");
  await writeJsonAtomic(outPath, report, outputDir);
  return outPath;
}
