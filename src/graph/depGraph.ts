import fs from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomic, validateOrThrow } from "../core/io.js";
import { DepGraphSchema, type DepGraph } from "../schemas/depGraph.schema.js";
import { SymbolIndexSchema, type SymbolIndex } from "../schemas/symbolIndex.schema.js";
import type { FileIndex } from "../schemas/fileIndex.schema.js";

const RE_IMPORT = /\bimport\s+(?:[^"']+\s+from\s+)?["']([^"']+)["']/g;
const RE_DYNAMIC = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const RE_REQUIRE = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

const RE_EXPORT_NAMED =
  /\bexport\s+(?:const|let|var|function|class|type|interface)\s+([A-Za-z0-9_]+)/g;
const RE_EXPORT_LIST = /\bexport\s*\{\s*([^}]+)\s*\}\s*(?:from\s+["']([^"']+)["'])?/g;

function isExternal(spec: string): boolean {
  return !(spec.startsWith(".") || spec.startsWith("/"));
}

export async function buildDepGraph(params: {
  repoRoot: string;
  outputDir: string;
  fileIndex: FileIndex;
}): Promise<{ depGraph: DepGraph; symbolIndex: SymbolIndex }> {
  const repoRoot = path.resolve(params.repoRoot);
  const outputDir = path.resolve(params.outputDir);

  const nodes: string[] = [];
  const edges: DepGraph["edges"] = [];
  const symbols: SymbolIndex["symbols"] = [];

  for (const f of params.fileIndex.files) {
    if (f.isBinary) continue;
    if (!["ts", "js", "mjs", "cjs"].includes(f.lang)) continue;

    nodes.push(f.path);
    const abs = path.join(repoRoot, f.path);
    const txt = await fs.readFile(abs, "utf8");

    const pushEdges = (re: RegExp, kind: DepGraph["edges"][number]["kind"]) => {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(txt))) {
        const spec = m[1] ?? "";
        edges.push({ from: f.path, to: spec, kind, isExternal: isExternal(spec) });
      }
    };

    pushEdges(RE_IMPORT, "import");
    pushEdges(RE_DYNAMIC, "dynamicImport");
    pushEdges(RE_REQUIRE, "require");

    // symbolIndex (light)
    RE_EXPORT_NAMED.lastIndex = 0;
    let em: RegExpExecArray | null;
    while ((em = RE_EXPORT_NAMED.exec(txt))) {
      const name = em[1] ?? "unknown";
      symbols.push({ name, file: f.path, kind: "export", exported: true });
    }

    RE_EXPORT_LIST.lastIndex = 0;
    while ((em = RE_EXPORT_LIST.exec(txt))) {
      const list = (em[1] ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const n of list) symbols.push({ name: n, file: f.path, kind: "export", exported: true });
    }
  }

  nodes.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  edges.sort((a, b) =>
    a.from !== b.from
      ? a.from < b.from
        ? -1
        : 1
      : a.to !== b.to
        ? a.to < b.to
          ? -1
          : 1
        : a.kind < b.kind
          ? -1
          : 1
  );
  symbols.sort((a, b) =>
    a.file !== b.file
      ? a.file < b.file
        ? -1
        : 1
      : a.name !== b.name
        ? a.name < b.name
          ? -1
          : 1
        : 0
  );

  const depGraph = validateOrThrow(DepGraphSchema, { schemaVersion: "1.0", nodes, edges });
  const symbolIndex = validateOrThrow(SymbolIndexSchema, { schemaVersion: "1.0", symbols });

  await writeJsonAtomic(path.join(outputDir, "facts", "depGraph.json"), depGraph, outputDir);
  await writeJsonAtomic(path.join(outputDir, "facts", "symbolIndex.json"), symbolIndex, outputDir);

  return { depGraph, symbolIndex };
}
