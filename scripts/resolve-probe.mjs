import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[process.argv.indexOf("--out") + 1];
if (!outDir) throw new Error("Usage: node scripts/resolve-probe.mjs --out <outDir>");

const depGraph = JSON.parse(fs.readFileSync(path.join(outDir, "facts/depGraph.json"), "utf8"));
const snapDir = fs
  .readdirSync(path.join(outDir, "snapshots"))
  .find((d) => fs.statSync(path.join(outDir, "snapshots", d)).isDirectory());
const fileIndex = JSON.parse(
  fs.readFileSync(path.join(outDir, "snapshots", snapDir, "fileIndex.json"), "utf8")
);

const repoRoot = depGraph.repoRoot ?? fileIndex.repoRoot ?? null;
if (!repoRoot) throw new Error("Could not infer repoRoot from artifacts.");

const tsconfigPath = path.join(repoRoot, "tsconfig.json");
const tsconfig = fs.existsSync(tsconfigPath)
  ? JSON.parse(fs.readFileSync(tsconfigPath, "utf8"))
  : null;
const pathsMap = tsconfig?.compilerOptions?.paths ?? {};

const fileSet = new Set(fileIndex.files.map((f) => f.path));

function candidatesForNoExt(p) {
  return [
    `${p}.ts`,
    `${p}.tsx`,
    `${p}.js`,
    `${p}.mjs`,
    `${p}.cjs`,
    path.join(p, "index.ts"),
    path.join(p, "index.tsx"),
    path.join(p, "index.js"),
    path.join(p, "index.mjs"),
    path.join(p, "index.cjs")
  ];
}

function tryMatchRepoPath(p) {
  const norm = p.split(path.sep).join("/"); // keep fileIndex style
  if (fileSet.has(norm)) return norm;
  for (const c of candidatesForNoExt(norm)) {
    if (fileSet.has(c)) return c;
  }
  return null;
}

// Apply tsconfig paths for exact match and "*" -> "./*"
function applyPaths(spec) {
  // exact matches first
  if (pathsMap[spec]?.length) return pathsMap[spec];
  // wildcard "*" only (as in your repo)
  if (pathsMap["*"]?.length) {
    return pathsMap["*"].map((t) => t.replace("*", spec));
  }
  return null;
}

function resolveToRepoFile(from, spec) {
  if (spec.startsWith("node:")) return null;

  // relative
  if (spec.startsWith(".") || spec.startsWith("..")) {
    const base = path.posix.dirname(from);
    const joined = path.posix.normalize(path.posix.join(base, spec));
    return tryMatchRepoPath(joined);
  }

  // tsconfig paths
  const mapped = applyPaths(spec);
  if (mapped) {
    for (const t of mapped) {
      // tsconfig paths are relative to tsconfig location (repo root here)
      const cleaned = t.replace(/^\.\//, "");
      const hit = tryMatchRepoPath(cleaned);
      if (hit) return hit;
    }
  }

  return null; // external
}

let total = depGraph.edges.length;
let inRepo = 0;
let external = 0;

const samples = { external: new Map(), inRepo: new Map() };

for (const e of depGraph.edges) {
  const from = e.from;
  const to = e.to;
  const resolved = resolveToRepoFile(from, to);
  if (resolved) {
    inRepo++;
    samples.inRepo.set(
      `${to} -> ${resolved}`,
      (samples.inRepo.get(`${to} -> ${resolved}`) ?? 0) + 1
    );
  } else {
    external++;
    samples.external.set(to, (samples.external.get(to) ?? 0) + 1);
  }
}

function topN(map, n = 15) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n);
}

console.log(
  JSON.stringify(
    {
      repoRoot,
      totalEdges: total,
      resolvedInRepo: inRepo,
      externalOrUnresolved: external,
      topExternalSpecifiers: topN(samples.external, 20),
      topResolvedMappings: topN(samples.inRepo, 20)
    },
    null,
    2
  )
);
