import path from "node:path";
import type { DepGraph } from "../schemas/depGraph.schema.js";
import type { FileIndex } from "../schemas/fileIndex.schema.js";
import type { BrainTopology } from "../schemas/topology.schema.js";
import type { SymbolIndex } from "../schemas/symbolIndex.schema.js";
import { EssencePackSchema, type EssencePack } from "../schemas/essence.schema.js";
import { computeImpactCone } from "../impact/cone.js";
import { ensureDir, validateOrThrow, writeFileAtomic, writeJsonAtomic } from "../core/io.js";

const MAX_CHARS = 800;
const MAX_EVIDENCE_POINTERS = 10;
const MAX_NODES = 20;

export async function generateFocusedEssence(params: {
  outputDir: string;
  target: string;
  depGraph: DepGraph;
  topology: BrainTopology;
  fileIndex: FileIndex;
  symbolIndex: SymbolIndex;
}): Promise<EssencePack> {
  const outputDir = path.resolve(params.outputDir);
  const cone = computeImpactCone({
    target: params.target,
    depGraph: params.depGraph,
    fileIndex: params.fileIndex
  });

  const nodeSet = new Set<string>([
    params.target,
    ...cone.directImports,
    ...cone.reverseImports,
    ...cone.indirectImportsDepth2
  ]);

  const nodesInCone = params.topology.nodes.filter((n) => nodeSet.has(n.id));
  const topCentralNodes = nodesInCone
    .sort((a, b) => (b.centrality !== a.centrality ? b.centrality - a.centrality : a.id < b.id ? -1 : 1))
    .slice(0, Math.min(5, MAX_NODES))
    .map((n) => n.id);

  const edgeCount = params.depGraph.edges.filter(
    (e) => nodeSet.has(e.from) && nodeSet.has(e.to)
  ).length;

  const centralSymbols = params.symbolIndex.symbols
    .filter((s) => topCentralNodes.includes(s.file))
    .map((s) => ({ path: s.file, note: `symbol:${s.name}` }))
    .sort((a, b) =>
      a.path !== b.path ? (a.path < b.path ? -1 : 1) : a.note < b.note ? -1 : 1
    );

  const testEvidence = cone.impactedTests.map((p) => ({ path: p, note: "test" }));
  const evidence = [...testEvidence, ...centralSymbols]
    .sort((a, b) =>
      a.path !== b.path ? (a.path < b.path ? -1 : 1) : a.note < b.note ? -1 : 1
    )
    .slice(0, MAX_EVIDENCE_POINTERS);

  const summaryParts = [
    `Focus: ${params.target}.`,
    `Cone nodes: ${nodeSet.size}, edges: ${edgeCount}.`,
    `Direct imports: ${cone.directImports.length}.`,
    `Reverse imports: ${cone.reverseImports.length}.`,
    `Indirect (depth 2): ${cone.indirectImportsDepth2.length}.`,
    `Impacted tests: ${cone.impactedTests.length}.`
  ];
  let overview = summaryParts.join(" ");
  if (overview.length > MAX_CHARS) overview = overview.slice(0, MAX_CHARS - 3) + "...";

  const pack = validateOrThrow(EssencePackSchema, {
    schemaVersion: "1.0",
    constraints: {
      maxChars: MAX_CHARS,
      maxEvidencePointers: MAX_EVIDENCE_POINTERS,
      maxNodes: MAX_NODES
    },
    overview,
    keyRisks: [],
    topologySummary: {
      nodeCount: nodeSet.size,
      edgeCount,
      topCentralNodes
    },
    evidencePointers: evidence
  });

  const jsonPath = path.join(outputDir, "essence", "pack.json");
  await writeJsonAtomic(jsonPath, pack, outputDir);

  const mdLines: string[] = [
    "# Focused Essence",
    "",
    pack.overview,
    "",
    "## Top Central Nodes",
    ...pack.topologySummary.topCentralNodes.slice(0, 3).map((n) => `- ${n}`),
    "",
    "## Impacted Tests",
    ...cone.impactedTests.slice(0, 5).map((t) => `- ${t}`),
    "",
    "## Evidence",
    ...pack.evidencePointers.slice(0, 5).map((e) => `- ${e.path}: ${e.note}`)
  ];
  const mdPath = path.join(outputDir, "essence", "pack.md");
  await ensureDir(path.dirname(mdPath));
  await writeFileAtomic(mdPath, mdLines.join("\n"));

  return pack;
}
