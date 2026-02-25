import fs from "node:fs/promises";
import path from "node:path";
import { sha256 } from "./hash.js";
import { stableStringify } from "./stableJson.js";
import { makeRunId } from "./runId.js";
import { appendLedger } from "./ledger.js";
import { computeOutputHash } from "./artifactHash.js";
import { getClock } from "./clock.js";
import { writeJsonAtomic } from "./io.js";
import { writeArtifactManifest } from "./manifest.js";
import { getStoragePaths } from "../utils/paths.js";
import { artifactsForPipeline } from "./artifactRegistry.js";
import { computeHealthSummary } from "../health/healthReport.js";

import { scanRepo } from "../scanner/scan.js";
import { detectRuntimeSignals } from "../analysis/runtimeSignals.js";
import { buildDepGraph } from "../graph/depGraph.js";
import { buildTopology } from "../topology/buildTopology.js";
import { detectGaps } from "../analysis/gapDetector.js";
import { generateEssence } from "../essence/generateEssence.js";
import { writeLastRunTelemetry } from "../telemetry/writeTelemetry.js";
import { runAdvancedMetrics } from "../advanced/runAdvancedMetrics.js";

async function hasAnyTests(repoRoot: string): Promise<boolean> {
  const glob = async (dir: string): Promise<string[]> => {
    const out: string[] = [];
    const stack = [dir];
    while (stack.length) {
      const d = stack.pop()!;
      let items: { name: string; isDirectory: () => boolean; isFile: () => boolean }[] = [];
      try {
        items = await fs.readdir(d, { withFileTypes: true });
      } catch {
        continue;
      }
      items.sort((a, b) => a.name.localeCompare(b.name));
      for (const it of items) {
        const p = path.join(d, it.name);
        if (it.isDirectory()) {
          if (
            it.name === "node_modules" ||
            it.name === ".git" ||
            it.name === "dist" ||
            it.name === "storage"
          )
            continue;
          stack.push(p);
        } else if (it.isFile()) {
          if (it.name.endsWith(".test.ts") || it.name.endsWith(".test.js")) out.push(p);
        }
      }
    }
    return out;
  };
  const matches = await glob(repoRoot);
  return matches.length > 0;
}

export type PipelineConfig = {
  repoRoot: string;
  outputDir: string;
  clockIso?: string; // injected for determinism tests
  force?: boolean;
  maxFiles?: number;
  maxBytes?: number;
  essenceMaxEvidence?: number;
  essenceMaxNodes?: number;
};

export type PipelineArtifacts = {
  fileIndexPath: string;
  depGraphPath: string;
  symbolIndexPath: string;
  runtimeSignalsPath: string;
  topologyPath: string;
  flowsPath: string;
  gapsJsonPath: string;
  gapsMdPath: string;
  essenceJsonPath: string;
  essenceMdPath: string;
};

export async function runFullPipeline(cfg: PipelineConfig): Promise<{
  runId: string;
  inputHash: string;
  outputHash: string;
  snapshotId: string;
  artifacts: PipelineArtifacts;
}> {
  const repoRoot = path.resolve(cfg.repoRoot);
  const outputDir = path.resolve(cfg.outputDir);
  const clock = getClock(
    cfg.clockIso ? { clockIso: cfg.clockIso, mode: "best-effort" } : { mode: "best-effort" }
  );

  const scanOpts: Parameters<typeof scanRepo>[0] = {
    repoRoot,
    outputDir,
    clock
  };
  if (cfg.force !== undefined) scanOpts.force = cfg.force;
  if (cfg.maxFiles !== undefined) scanOpts.maxFiles = cfg.maxFiles;
  if (cfg.maxBytes !== undefined) scanOpts.maxBytes = cfg.maxBytes;
  const t0 = Date.now();
  const scan = await scanRepo(scanOpts);
  const scanMs = Date.now() - t0;
  const paths = getStoragePaths(outputDir, scan.snapshotId);

  const tGraph = Date.now();
  const runtime = await detectRuntimeSignals({
    repoRoot,
    outputDir,
    fileIndex: scan.fileIndex
  });

  const { depGraph, symbolIndex } = await buildDepGraph({
    repoRoot,
    outputDir,
    fileIndex: scan.fileIndex
  });

  const { topology } = await buildTopology({
    outputDir,
    depGraph,
    runtimeSignals: runtime,
    _symbolIndex: symbolIndex
  });
  const graphMs = Date.now() - tGraph;

  const tTopo = Date.now();
  const testsExist = await hasAnyTests(repoRoot);
  const gaps = await detectGaps({
    outputDir,
    depGraph,
    runtimeSignals: runtime,
    topology,
    hasTests: testsExist
  });

  const essenceOpts: Parameters<typeof generateEssence>[0] = {
    outputDir,
    topology,
    gaps
  };
  if (cfg.essenceMaxEvidence !== undefined)
    essenceOpts.maxEvidencePointers = cfg.essenceMaxEvidence;
  if (cfg.essenceMaxNodes !== undefined) essenceOpts.maxNodes = cfg.essenceMaxNodes;
  await generateEssence(essenceOpts);
  // WRAP_ESSENCE_V1
  {
    const packPath = paths.essencePackJson;
    const raw = JSON.parse(await fs.readFile(packPath, "utf8"));
    const wrapped = {
      identity: {
        schemaVersion: "1.0",
        snapshotId: scan.snapshotId,
        inputHash: scan.inputHash
      },
      payload: raw
    };
    await writeJsonAtomic(packPath, wrapped, outputDir);
  }

  const topologyMs = Date.now() - tTopo;

  const totalMs = Date.now() - t0;
  await writeLastRunTelemetry(outputDir, {
    scanMs,
    graphMs,
    topologyMs,
    totalMs
  });

  const artifactRel = artifactsForPipeline(outputDir, {
    fileIndexPath: paths.fileIndex,
    depGraphPath: paths.depGraph,
    symbolIndexPath: paths.symbolIndex,
    runtimeSignalsPath: paths.runtimeSignals,
    topologyPath: paths.brainTopology,
    flowsPath: paths.flows,
    gapsJsonPath: paths.gapsReportJson,
    gapsMdPath: paths.gapsReportMd,
    essenceJsonPath: paths.essencePackJson,
    essenceMdPath: paths.essencePackMd
  });

  const startIso = clock.nowIso();
  const runId = makeRunId(scan.inputHash, startIso);

  await runAdvancedMetrics(outputDir);

  // ---- RC METRICS CONTRACT ----
  const health = await computeHealthSummary(outputDir);

  const rcMetrics = {
    schemaVersion: "1.0",
    healthScore: health.systemHealthScore,
    nodeCount: topology.metrics.nodeCount,
    edgeCount: topology.metrics.edgeCount,
    duplicatePairs: health.duplicatePairs,
    gatewayNodes: health.gatewayNodes,
    structuralDensity: health.structuralDensity
  };

  const rcMetricsRelPath = "rc_metrics.json";

  await writeJsonAtomic(
    path.join(outputDir, rcMetricsRelPath),
    rcMetrics,
    outputDir
  );

  const artifactRelFinal = [...artifactRel, rcMetricsRelPath];

  await writeArtifactManifest({
    outputDir,
    artifacts: artifactRelFinal,
    repoHash: scan.inputHash,
    snapshotId: scan.snapshotId,
    runId,
    generatedAtIso: startIso
  });

  const artifactRelWithManifest = [...artifactRelFinal, "system/manifest.json"];
  const outputHash = await computeOutputHash(outputDir, artifactRelWithManifest);

  await appendLedger({
    outputDir,
    entry: {
      runId,
      atIso: startIso,
      command: "pipeline",
      repoRoot,
      inputHash: scan.inputHash,
      outputHash,
      artifacts: artifactRelWithManifest,
      notes: []
    }
  });

  return {
    runId,
    inputHash: scan.inputHash,
    outputHash,
    snapshotId: scan.snapshotId,
    artifacts: {
      fileIndexPath: paths.fileIndex,
      depGraphPath: paths.depGraph,
      symbolIndexPath: paths.symbolIndex,
      runtimeSignalsPath: paths.runtimeSignals,
      topologyPath: paths.brainTopology,
      flowsPath: paths.flows,
      gapsJsonPath: paths.gapsReportJson,
      gapsMdPath: paths.gapsReportMd,
      essenceJsonPath: paths.essencePackJson,
      essenceMdPath: paths.essencePackMd
    }
  };
}

export function computeInputSignature(repoRoot: string, inputHash: string): string {
  return sha256(stableStringify({ repoRoot: path.resolve(repoRoot), inputHash }));
}
