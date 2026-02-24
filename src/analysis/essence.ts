import path from "node:path";
import type { BrainTopology } from "../schemas/topology.schema.js";
import type { GapsReport } from "../schemas/gapsReport.schema.js";
import type { EssencePack } from "../schemas/essence.schema.js";
import { ensureDir, writeJsonAtomic, validateOrThrow } from "../core/io.js";
import { EssencePackSchema } from "../schemas/essence.schema.js";

const MAX_CHARS = 12_000;
const DEFAULT_MAX_EVIDENCE_POINTERS = 30;
const DEFAULT_MAX_NODES = 200;
const TOP_CENTRAL_COUNT = 5;
const MAX_KEY_RISKS = 10;

export async function buildEssencePack(params: {
  outputDir: string;
  topology: BrainTopology;
  gapsReport: GapsReport;
  maxEvidencePointers?: number;
  maxNodes?: number;
}): Promise<EssencePack> {
  const outputDir = path.resolve(params.outputDir);
  const { topology, gapsReport } = params;
  const maxEvidencePointers = params.maxEvidencePointers ?? DEFAULT_MAX_EVIDENCE_POINTERS;
  const maxNodes = params.maxNodes ?? DEFAULT_MAX_NODES;

  const constraints = {
    maxChars: MAX_CHARS,
    maxEvidencePointers,
    maxNodes
  };

  const nodesByCentrality = [...topology.nodes].sort((a, b) => {
    const c = b.centrality - a.centrality;
    if (c !== 0) return c;
    return a.id < b.id ? -1 : 1;
  });
  const topCentralNodes = nodesByCentrality
    .slice(0, Math.min(TOP_CENTRAL_COUNT, maxNodes))
    .map((n) => n.id);

  const topologySummary = {
    nodeCount: topology.metrics.nodeCount,
    edgeCount: topology.metrics.edgeCount,
    topCentralNodes
  };

  const uniqueTitles = [...new Set(gapsReport.gaps.map((g) => g.title))].sort();
  const keyRisks = uniqueTitles.slice(0, MAX_KEY_RISKS);

  const evidencePointers: { path: string; note: string }[] = [];
  for (const g of gapsReport.gaps) {
    for (const e of g.evidence) {
      evidencePointers.push({ path: e.file, note: e.note });
    }
  }
  evidencePointers.sort((a, b) =>
    a.path !== b.path ? (a.path < b.path ? -1 : 1) : a.note < b.note ? -1 : 1
  );
  const truncatedEvidence = evidencePointers.slice(0, maxEvidencePointers);

  const summaryParts: string[] = [
    `Nodes: ${topologySummary.nodeCount}, edges: ${topologySummary.edgeCount}.`,
    `Gaps: ${gapsReport.summary.critical} critical, ${gapsReport.summary.high} high, ${gapsReport.summary.medium} medium, ${gapsReport.summary.low} low.`,
    `Top central: ${topCentralNodes.join(", ")}.`,
    keyRisks.length > 0 ? `Key risks: ${keyRisks.join("; ")}.` : ""
  ];
  let overview = summaryParts.filter(Boolean).join(" ");
  if (overview.length > MAX_CHARS) overview = overview.slice(0, MAX_CHARS - 3) + "...";

  const pack = validateOrThrow(EssencePackSchema, {
    schemaVersion: "1.0",
    constraints,
    overview,
    keyRisks,
    topologySummary,
    evidencePointers: truncatedEvidence
  });

  const jsonPath = path.join(outputDir, "essence", "pack.json");
  await writeJsonAtomic(jsonPath, pack, outputDir);

  const mdLines: string[] = [
    "# Essence Pack",
    "",
    "## Overview",
    "",
    pack.overview,
    "",
    "## Topology",
    "",
    `- Nodes: ${pack.topologySummary.nodeCount}, Edges: ${pack.topologySummary.edgeCount}`,
    `- Top central: ${pack.topologySummary.topCentralNodes.join(", ")}`,
    "",
    "## Key risks",
    "",
    ...pack.keyRisks.map((r) => `- ${r}`),
    "",
    "## Evidence pointers",
    "",
    ...pack.evidencePointers.map((e) => `- ${e.path}: ${e.note}`)
  ];
  const mdPath = path.join(outputDir, "essence", "pack.md");
  const { writeFileAtomic } = await import("../core/io.js");
  await ensureDir(path.dirname(mdPath));
  await writeFileAtomic(mdPath, mdLines.join("\n"));

  return pack;
}
