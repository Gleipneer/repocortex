import fs from "node:fs/promises";
import path from "node:path";
import { sha256 } from "./hash.js";

// Hash outputs deterministically by concatenating file contents in sorted order.
export async function computeOutputHash(
  outputDir: string,
  artifactPaths: string[]
): Promise<string> {
  const abs = artifactPaths
    .map((p) => path.resolve(outputDir, p))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  let acc = "";
  for (const p of abs) {
    const buf = await fs.readFile(p);
    acc += `${p}\n${buf.toString("utf8")}\n`;
  }
  return sha256(acc);
}
