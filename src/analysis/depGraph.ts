import fs from "node:fs/promises";
import path from "node:path";
import type { DepGraph, DepEdge } from "../schemas/depGraph.schema.js";
import type { SymbolIndex, Symbol } from "../schemas/symbolIndex.schema.js";
import type { FileIndex } from "../schemas/fileIndex.schema.js";
import { writeJsonAtomic, validateOrThrow } from "../core/io.js";
import { DepGraphSchema } from "../schemas/depGraph.schema.js";
import { SymbolIndexSchema } from "../schemas/symbolIndex.schema.js";

const SPECIFIER_FROM = /from\s+["']([^"']+)["']/g;
const SIDE_EFFECT_IMPORT = /import\s+["']([^"']+)["']\s*;?/g;
const DYNAMIC_IMPORT = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
const REQUIRE = /require\s*\(\s*["']([^"']+)["']\s*\)/g;

const EXPORT_FUNCTION = /export\s+function\s+(\w+)/g;
const EXPORT_CLASS = /export\s+class\s+(\w+)/g;
const EXPORT_CONST = /export\s+const\s+(\w+)/g;
const EXPORT_TYPE = /export\s+type\s+(\w+)/g;
const EXPORT_INTERFACE = /export\s+interface\s+(\w+)/g;
const EXPORT_NAMED = /export\s*\{\s*([^}]+)\}/g;

function isExternal(spec: string): boolean {
  const t = spec.trim();
  return !t.startsWith(".") && !t.startsWith("/");
}

function* allMatches(re: RegExp, text: string): Generator<string> {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1]) yield m[1];
  }
}

function collectImports(
  text: string
): { specifier: string; kind: "import" | "require" | "dynamicImport" }[] {
  const seen = new Set<string>();
  const out: { specifier: string; kind: "import" | "require" | "dynamicImport" }[] = [];

  for (const spec of allMatches(SPECIFIER_FROM, text)) {
    const key = `import:${spec}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ specifier: spec, kind: "import" });
    }
  }
  for (const spec of allMatches(SIDE_EFFECT_IMPORT, text)) {
    const key = `import:${spec}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ specifier: spec, kind: "import" });
    }
  }
  for (const spec of allMatches(DYNAMIC_IMPORT, text)) {
    const key = `dynamic:${spec}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ specifier: spec, kind: "dynamicImport" });
    }
  }
  for (const spec of allMatches(REQUIRE, text)) {
    const key = `require:${spec}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ specifier: spec, kind: "require" });
    }
  }
  return out;
}

function collectExports(text: string, filePath: string): Symbol[] {
  const symbols: Symbol[] = [];
  const seen = new Set<string>();

  const add = (name: string, kind: Symbol["kind"]) => {
    if (seen.has(name)) return;
    seen.add(name);
    symbols.push({ name, file: filePath, kind, exported: true });
  };

  for (const n of allMatches(EXPORT_FUNCTION, text)) add(n, "function");
  for (const n of allMatches(EXPORT_CLASS, text)) add(n, "class");
  for (const n of allMatches(EXPORT_CONST, text)) add(n, "const");
  for (const n of allMatches(EXPORT_TYPE, text)) add(n, "type");
  for (const n of allMatches(EXPORT_INTERFACE, text)) add(n, "interface");
  for (const block of allMatches(EXPORT_NAMED, text)) {
    const parts = block.split(",").map((s) => (s.trim().split(/\s+as\s+/)[0] ?? s).trim());
    for (const p of parts) {
      const name = p.split(/\s+/).pop();
      if (name && /^\w+$/.test(name)) add(name, "export");
    }
  }

  return symbols;
}

function isJsOrTsPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.endsWith(".ts") ||
    lower.endsWith(".js") ||
    lower.endsWith(".mjs") ||
    lower.endsWith(".cjs")
  );
}

export async function extractDepGraphAndSymbols(params: {
  repoRoot: string;
  outputDir: string;
  fileIndex: FileIndex;
}): Promise<{ depGraph: DepGraph; symbolIndex: SymbolIndex }> {
  const repoRoot = path.resolve(params.repoRoot);
  const outputDir = path.resolve(params.outputDir);

  const scriptFiles = params.fileIndex.files
    .filter((f) => !f.isBinary && isJsOrTsPath(f.path))
    .map((f) => f.path)
    .sort();

  const nodes = [...scriptFiles];
  const edges: DepEdge[] = [];
  const allSymbols: Symbol[] = [];

  for (const filePath of scriptFiles) {
    const abs = path.join(repoRoot, filePath);
    const txt = await fs.readFile(abs, "utf8");

    for (const { specifier, kind } of collectImports(txt)) {
      edges.push({
        from: filePath,
        to: specifier,
        kind,
        isExternal: isExternal(specifier)
      });
    }

    const syms = collectExports(txt, filePath);
    allSymbols.push(...syms);
  }

  edges.sort((a, b) => {
    if (a.from !== b.from) return a.from < b.from ? -1 : 1;
    if (a.to !== b.to) return a.to < b.to ? -1 : 1;
    return a.kind < b.kind ? -1 : 1;
  });

  allSymbols.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    return a.name < b.name ? -1 : 1;
  });

  const depGraph = validateOrThrow(DepGraphSchema, {
    schemaVersion: "1.0",
    nodes,
    edges
  });

  const symbolIndex = validateOrThrow(SymbolIndexSchema, {
    schemaVersion: "1.0",
    symbols: allSymbols
  });

  const depPath = path.join(outputDir, "facts", "depGraph.json");
  const symPath = path.join(outputDir, "facts", "symbolIndex.json");
  await writeJsonAtomic(depPath, depGraph, outputDir);
  await writeJsonAtomic(symPath, symbolIndex, outputDir);

  return { depGraph, symbolIndex };
}
