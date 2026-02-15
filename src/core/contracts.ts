import { validateOrThrow } from "./io.js";
import { FileIndexSchema } from "../schemas/fileIndex.schema.js";
import { DepGraphSchema } from "../schemas/depGraph.schema.js";
import { SymbolIndexSchema } from "../schemas/symbolIndex.schema.js";
import { RuntimeSignalsSchema } from "../schemas/runtimeSignals.schema.js";
import { BrainTopologySchema, FlowsSchema } from "../schemas/topology.schema.js";
import { GapsReportSchema } from "../schemas/gapsReport.schema.js";
import { EssencePackSchema } from "../schemas/essence.schema.js";
import { LedgerEntrySchema } from "../schemas/ledger.schema.js";

export const Contracts = {
  fileIndex: (x: unknown) => validateOrThrow(FileIndexSchema, x),
  depGraph: (x: unknown) => validateOrThrow(DepGraphSchema, x),
  symbolIndex: (x: unknown) => validateOrThrow(SymbolIndexSchema, x),
  runtimeSignals: (x: unknown) => validateOrThrow(RuntimeSignalsSchema, x),
  topology: (x: unknown) => validateOrThrow(BrainTopologySchema, x),
  flows: (x: unknown) => validateOrThrow(FlowsSchema, x),
  gaps: (x: unknown) => validateOrThrow(GapsReportSchema, x),
  essence: (x: unknown) => validateOrThrow(EssencePackSchema, x),
  ledger: (x: unknown) => validateOrThrow(LedgerEntrySchema, x)
} as const;
