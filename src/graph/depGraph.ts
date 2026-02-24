import fs from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomic, validateOrThrow, ensureDir } from "../core/io.js";
import { DepGraphSchema } from "../schemas/depGraph.schema.js";
import { SymbolIndexSchema } from "../schemas/symbolIndex.schema.js";

const RE_IMPORT = /\bimport\s+(?:[^"']+\s+from\s+)?["']([^"']+)["']/g;
const RE_DYNAMIC = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const RE_REQUIRE = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

function isExternal(spec: string) {
  return !(spec.startsWith(".") || spec.startsWith("/"));
}

function normalize(spec: string) {
  return spec
    .replace(/^\.\//, "")
    .replace(/\.\.\//g, "")
    .replace(/\.(ts|js|mjs|cjs)$/, "");
}

function resolveBySuffix(spec: string, fileIndex: any) {
  const norm = normalize(spec);

  const match = fileIndex.files.find((f: any) => {
    const base = f.path.replace(/\.(ts|js|mjs|cjs)$/, "");
    return (
      base.endsWith(norm) ||
      base.endsWith(norm + "/index")
    );
  });

  return match ? match.path : null;
}

export async function buildDepGraph(params: any) {
  const repoRoot = path.resolve(params.repoRoot);
  const outputDir = path.resolve(params.outputDir);

  const nodes: string[] = [];
  const edges: any[] = [];

  for (const f of params.fileIndex.files) {
    if (f.isBinary) continue;
    if (!["ts", "js", "mjs", "cjs"].includes(f.lang)) continue;

    nodes.push(f.path);

    const abs = path.join(repoRoot, f.path);
    const txt = await fs.readFile(abs, "utf8");

    const processRegex = (re: RegExp, kind: string) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(txt))) {
        const spec = m[1] ?? "";
        if (isExternal(spec)) continue;

        const resolved = resolveBySuffix(spec, params.fileIndex);
        if (resolved) {
          edges.push({
            from: f.path,
            to: resolved,
            kind,
            isExternal: false
          });
        }
      }
    };

    processRegex(RE_IMPORT, "import");
    processRegex(RE_DYNAMIC, "dynamicImport");
    processRegex(RE_REQUIRE, "require");
  }

  nodes.sort();
  edges.sort((a, b) =>
    a.from !== b.from
      ? a.from < b.from ? -1 : 1
      : a.to !== b.to
      ? a.to < b.to ? -1 : 1
      : a.kind < b.kind ? -1 : 1
  );

  const depGraph = validateOrThrow(DepGraphSchema, {
    schemaVersion: "1.0",
    nodes,
    edges
  });

  const symbolIndex = validateOrThrow(SymbolIndexSchema, {
    schemaVersion: "1.0",
    symbols: []
  });

  const factsDir = path.join(outputDir, "facts");
  await ensureDir(factsDir);
  await writeJsonAtomic(path.join(factsDir, "depGraph.json"), depGraph, outputDir);
  await writeJsonAtomic(path.join(factsDir, "symbolIndex.json"), symbolIndex, outputDir);

  return { depGraph, symbolIndex };
}
