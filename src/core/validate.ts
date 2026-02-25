import type { FileIndex } from "../schemas/fileIndex.schema.js";
import { FileIndexSchema } from "../schemas/fileIndex.schema.js";
import type { DepGraph } from "../schemas/depGraph.schema.js";
import { DepGraphSchema } from "../schemas/depGraph.schema.js";
import type { SymbolIndex } from "../schemas/symbolIndex.schema.js";
import { SymbolIndexSchema } from "../schemas/symbolIndex.schema.js";
import type { RuntimeSignals } from "../schemas/runtimeSignals.schema.js";
import { RuntimeSignalsSchema } from "../schemas/runtimeSignals.schema.js";
import type { BrainTopology } from "../schemas/topology.schema.js";
import { BrainTopologySchema } from "../schemas/topology.schema.js";
import type { Flows } from "../schemas/topology.schema.js";
import { FlowsSchema } from "../schemas/topology.schema.js";
import type { GapsReport } from "../schemas/gapsReport.schema.js";
import { GapsReportSchema } from "../schemas/gapsReport.schema.js";
import type { EssencePack } from "../schemas/essence.schema.js";
import { EssencePackSchema } from "../schemas/essence.schema.js";
import type { LedgerEntry } from "../schemas/ledger.schema.js";
import { LedgerEntrySchema } from "../schemas/ledger.schema.js";
import type { AdvancedMetrics } from "../schemas/advancedMetrics.schema.js";
import { AdvancedMetricsSchema } from "../schemas/advancedMetrics.schema.js";
import type { ArtifactManifest } from "../schemas/manifest.schema.js";
import { ArtifactManifestSchema } from "../schemas/manifest.schema.js";
import type { RCMetrics } from "../schemas/rcMetrics.schema.js";
import { RCMetricsSchema } from "../schemas/rcMetrics.schema.js";
import type { RepocortexConfig } from "../schemas/repocortexConfig.schema.js";
import { RepocortexConfigSchema } from "../schemas/repocortexConfig.schema.js";

export function parseFileIndex(data: unknown): FileIndex {
  return FileIndexSchema.parse(data);
}

export function parseDepGraph(data: unknown): DepGraph {
  return DepGraphSchema.parse(data);
}

export function parseSymbolIndex(data: unknown): SymbolIndex {
  return SymbolIndexSchema.parse(data);
}

export function parseRuntimeSignals(data: unknown): RuntimeSignals {
  return RuntimeSignalsSchema.parse(data);
}

export function parseBrainTopology(data: unknown): BrainTopology {
  return BrainTopologySchema.parse(data);
}

export function parseFlows(data: unknown): Flows {
  return FlowsSchema.parse(data);
}

export function parseGapsReport(data: unknown): GapsReport {
  return GapsReportSchema.parse(data);
}

export function parseEssencePack(data: unknown): EssencePack {
  return EssencePackSchema.parse(data);
}

export function parseLedgerEntry(data: unknown): LedgerEntry {
  return LedgerEntrySchema.parse(data);
}

export function parseAdvancedMetrics(data: unknown): AdvancedMetrics {
  return AdvancedMetricsSchema.parse(data);
}

export function parseArtifactManifest(data: unknown): ArtifactManifest {
  return ArtifactManifestSchema.parse(data);
}

export function parseRCMetrics(data: unknown): RCMetrics {
  return RCMetricsSchema.parse(data);
}

export function parseRepocortexConfig(data: unknown): RepocortexConfig {
  return RepocortexConfigSchema.parse(data);
}
