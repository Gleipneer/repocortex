import fs from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomic, validateOrThrow } from "../core/io.js";
import { RuntimeSignalsSchema, type RuntimeSignals } from "../schemas/runtimeSignals.schema.js";
import type { FileIndex } from "../schemas/fileIndex.schema.js";

type Hit = { kind: RuntimeSignals["signals"][number]["kind"]; re: RegExp };

const HITS: Hit[] = [
  { kind: "spawn", re: /\bchild_process\.(spawn|spawnSync)\b|\bspawn\s*\(/g },
  { kind: "exec", re: /\bchild_process\.(exec|execSync)\b|\bexec\s*\(/g },
  { kind: "httpServer", re: /\bhttp\s*\.\s*createServer\s*\(/g },
  { kind: "httpsServer", re: /\bhttps\s*\.\s*createServer\s*\(/g },
  { kind: "setInterval", re: /\bsetInterval\s*\(/g },
  { kind: "setTimeout", re: /\bsetTimeout\s*\(/g },
  { kind: "chokidarWatch", re: /\bchokidar\.watch\s*\(/g },
  {
    kind: "fsWrite",
    re: /\bfs\.(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream)\b/g
  },
  { kind: "envMutation", re: /\bprocess\.env\.[A-Z0-9_]+\s*=/gi },
  { kind: "netListen", re: /\bnet\.createServer\s*\(/g },
  { kind: "bindAllInterfaces", re: /\blisten\s*\([^)]*["']0\.0\.0\.0["']/g }
];

function findLineNumber(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

export async function detectRuntimeSignals(params: {
  repoRoot: string;
  outputDir: string;
  fileIndex: FileIndex;
}): Promise<RuntimeSignals> {
  const repoRoot = path.resolve(params.repoRoot);
  const outputDir = path.resolve(params.outputDir);

  const signals: RuntimeSignals["signals"] = [];

  for (const f of params.fileIndex.files) {
    if (f.isBinary) continue;
    const ext = f.lang;
    if (!["ts", "js", "mjs", "cjs"].includes(ext)) continue;

    const abs = path.join(repoRoot, f.path);
    const txt = await fs.readFile(abs, "utf8");

    for (const hit of HITS) {
      hit.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = hit.re.exec(txt))) {
        const line = findLineNumber(txt, m.index);
        const snippet =
          txt.slice(m.index, Math.min(txt.length, m.index + 120)).split(/\r?\n/)[0] ?? "";
        signals.push({ file: f.path, line, kind: hit.kind, snippet });
      }
    }
  }

  signals.sort((a, b) =>
    a.file !== b.file
      ? a.file < b.file
        ? -1
        : 1
      : a.line !== b.line
        ? a.line - b.line
        : a.kind < b.kind
          ? -1
          : 1
  );

  const out = validateOrThrow(RuntimeSignalsSchema, { schemaVersion: "1.0", signals });

  const outPath = path.join(outputDir, "facts", "runtimeSignals.json");
  await writeJsonAtomic(outPath, out, outputDir);
  return out;
}
