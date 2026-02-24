import fs from "node:fs/promises";
import path from "node:path";
import { sha256 } from "./hash.js";

// Hash outputs deterministically by concatenating file contents in sorted order.
export async function computeOutputHash(
  outputDir: string,
  artifactPaths: string[]
): Promise<string> {
  const entries = artifactPaths.map((p) => {
    const isAbs = path.isAbsolute(p);
    const rel = isAbs ? path.relative(outputDir, p) : p;
    const relPosix = rel.split(path.sep).join("/");
    const abs = isAbs ? p : path.resolve(outputDir, p);
    return { rel: relPosix, abs };
  });
  entries.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

  let acc = "";
  for (const e of entries) {
    const buf = await fs.readFile(e.abs);
    acc += `${e.rel}\n${buf.toString("utf8")}\n`;
  }
  return sha256(acc);
}
