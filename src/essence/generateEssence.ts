import path from "node:path";
import { ensureDir, writeFileAtomic, writeJsonAtomic, validateOrThrow } from "../core/io.js";
import type { BrainTopology } from "../schemas/topology.schema.js";
import type { GapsReport } from "../schemas/gapsReport.schema.js";
import { EssencePackSchema, type EssencePack } from "../schemas/essence.schema.js";

const DEFAULT_MAX_EVIDENCE_POINTERS = 30;
const DEFAULT_MAX_NODES = 200;

export async function generateEssence(params: {
  outputDir: string;
  topology: BrainTopology;
  gaps: GapsReport;
  maxEvidencePointers?: number;
  maxNodes?: number;
}): Promise<EssencePack> {
  const outputDir = path.resolve(params.outputDir);
  const maxEvidencePointers = params.maxEvidencePointers ?? DEFAULT_MAX_EVIDENCE_POINTERS;
  const maxNodes = params.maxNodes ?? DEFAULT_MAX_NODES;

  const nodes = [...params.topology.nodes]
    .sort((a, b) => {
      const c = b.centrality - a.centrality;
      if (c !== 0) return c;
      return a.id < b.id ? -1 : 1;
    })
    .slice(0, Math.min(5, maxNodes))
    .map((n) => n.id);

  const keyRisks = [...new Set(params.gaps.gaps.map((g) => g.title))].sort().slice(0, 10);

  const evidenceRaw = params.gaps.gaps.flatMap((g) =>
    g.evidence.map((e) => ({
      path: e.file,
      note: `${g.title}${e.line ? `:${e.line}` : ""}`
    }))
  );
  evidenceRaw.sort((a, b) =>
    a.path !== b.path ? (a.path < b.path ? -1 : 1) : a.note < b.note ? -1 : 1
  );
  const evidence = evidenceRaw.slice(0, maxEvidencePointers);

  const overview = `Repo has ${params.topology.metrics.nodeCount} modules and ${params.topology.metrics.edgeCount} edges. ${keyRisks.length} distinct risk categories detected.`;

  const pack = validateOrThrow(EssencePackSchema, {
    schemaVersion: "1.0",
    constraints: { maxChars: 12000, maxEvidencePointers, maxNodes },
    overview,
    keyRisks,
    topologySummary: {
      nodeCount: params.topology.metrics.nodeCount,
      edgeCount: params.topology.metrics.edgeCount,
      topCentralNodes: nodes
    },
    evidencePointers: evidence
  });

  await writeJsonAtomic(path.join(outputDir, "essence", "pack.json"), pack, outputDir);

  const md = [
    "# Essence Pack",
    "",
    overview,
    "",
    "## Top Central Nodes",
    ...nodes.map((n) => `- ${n}`),
    "",
    "## Key Risks",
    ...keyRisks.map((r) => `- ${r}`)
  ].join("\n");

  const mdPath = path.join(outputDir, "essence", "pack.md");
  await ensureDir(path.dirname(mdPath));
  await writeFileAtomic(mdPath, md);

  return pack;
}
