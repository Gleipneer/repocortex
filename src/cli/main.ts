import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { Command } from "commander";
import { scanRepo } from "../scanner/scan.js";
import { detectRuntimeSignals } from "../analysis/runtimeSignals.js";
import { buildDepGraph } from "../graph/depGraph.js";
import { buildTopology } from "../topology/buildTopology.js";
import { detectGaps } from "../analysis/gapDetector.js";
import { generateEssence } from "../essence/generateEssence.js";
import { runFullPipeline } from "../core/pipeline.js";
import { appendLedger } from "../core/ledger.js";
import { computeOutputHash } from "../core/artifactHash.js";
import { makeRunId } from "../core/runId.js";
import { getStoragePaths, getStorageRoot } from "../utils/paths.js";
import { getConfigPath } from "../config/loadConfig.js";
import { createConfig } from "../config/createConfig.js";
import { mergeConfig, type ConfigOverrides } from "../core/config.js";
import { prompt, confirm } from "./prompt.js";
import { printRunSummary } from "./runSummary.js";
import { parseLedgerEntry } from "../core/validate.js";
import { buildRunSummary, printArtifacts } from "../core/summary.js";
import { runAdvancedMetrics } from "../advanced/runAdvancedMetrics.js";
import { sha256 } from "../core/hash.js";
import { runVerify } from "../verification/runVerify.js";
import { runSnapshotContracts } from "../contracts/snapshotContracts.js";
import { runExport } from "../export/runExport.js";
import { computeImpact } from "../impact/reach.js";
import { runDuplicateDetector } from "../analysis/duplicateDetector.js";
import { computeHealthSummary } from "../health/healthReport.js";
import { runDiff } from "../diff/runDiff.js";
import { ImpactReportSchema } from "../schemas/impactReport.schema.js";
import { ensureDir, validateOrThrow, writeJsonAtomic } from "../core/io.js";
import { getCliClock } from "./clock.js";

console.log = (...args: unknown[]) => {
  fsSync.writeFileSync(1, `${args.map(String).join(" ")}\n`);
};
console.error = (...args: unknown[]) => {
  fsSync.writeFileSync(2, `${args.map(String).join(" ")}\n`);
};

const program = new Command();

program
  .name("repocortex")
  .description("RepoCortex — deterministic, read-only codebase intelligence engine")
  .version("0.1.0");

function mustOutDir(out?: string): string {
  return path.resolve(out ?? getStorageRoot());
}

type ScanGuardOpts = { force?: boolean; maxFiles?: string; maxBytes?: string };

function parseScanGuards(opts: ScanGuardOpts): {
  force: boolean;
  maxFiles: number | undefined;
  maxBytes: number | undefined;
} {
  const force = Boolean(opts.force);
  let maxFiles: number | undefined;
  let maxBytes: number | undefined;
  if (opts.maxFiles !== undefined) {
    const n = parseInt(opts.maxFiles, 10);
    if (Number.isNaN(n) || n < 1) throw new Error("--max-files must be a positive integer");
    maxFiles = n;
  }
  if (opts.maxBytes !== undefined) {
    const n = parseInt(opts.maxBytes, 10);
    if (Number.isNaN(n) || n < 1) throw new Error("--max-bytes must be a positive integer (bytes)");
    maxBytes = n;
  }
  return { force, maxFiles, maxBytes };
}

async function hasAnyTests(repoRoot: string): Promise<boolean> {
  try {
    const tdir = path.join(repoRoot, "tests");
    const st = await fs.stat(tdir);
    if (st.isDirectory()) return true;
  } catch {
    // fallback
  }
  const candidates = ["src", "test", "spec", "."].map((d) => path.join(repoRoot, d));
  for (const c of candidates) {
    try {
      const items = await fs.readdir(c, { withFileTypes: true });
      for (const it of items)
        if (it.isFile() && (it.name.endsWith(".test.ts") || it.name.endsWith(".test.js")))
          return true;
    } catch {
      // ignore
    }
  }
  return false;
}

program
  .command("status")
  .description("Show basic status")
  .action(() => console.log("repocortex: ok"));

const DEFAULT_MAX_FILES = "50000";
const DEFAULT_MAX_BYTES = "2000000000";

program
  .command("init")
  .description("Create repocortex.config.json (bootstrap)")
  .option("--repo <path>", "Repo root (default: current directory)")
  .option("--out <path>", "Output dir (default: ./storage)")
  .option("--max-files <n>", "Max file count (default: 50000)")
  .option("--max-bytes <n>", "Max total bytes (default: 2000000000)")
  .option("--clock-iso <iso>", "Fixed clock for determinism (ISO string)")
  .option("--config <path>", "Path to config file (default: ./repocortex.config.json)")
  .option("--force", "Overwrite existing config")
  .option("--non-interactive", "Fail if required values missing; no prompts")
  .action(
    async (opts: {
      repo?: string;
      out?: string;
      maxFiles?: string;
      maxBytes?: string;
      clockIso?: string;
      config?: string;
      force?: boolean;
      nonInteractive?: boolean;
    }) => {
      const projectRoot = process.cwd();
      const ni = Boolean(opts.nonInteractive);

      const repoRootRaw = opts.repo ?? (await prompt("Repo root path?", ".", ni));
      if (ni && !opts.repo && !repoRootRaw) {
        throw new Error("Repo root required. Use --repo <path> or run without --non-interactive.");
      }
      const outputDirRaw = opts.out ?? (await prompt("Output dir?", "./storage", ni));
      const maxFilesStr = opts.maxFiles ?? (await prompt("maxFiles?", DEFAULT_MAX_FILES, ni));
      const maxBytesStr = opts.maxBytes ?? (await prompt("maxBytes?", DEFAULT_MAX_BYTES, ni));

      const maxFiles = parseInt(maxFilesStr, 10);
      const maxBytes = parseInt(maxBytesStr, 10);
      if (Number.isNaN(maxFiles) || maxFiles < 1)
        throw new Error("maxFiles must be a positive integer");
      if (Number.isNaN(maxBytes) || maxBytes < 1)
        throw new Error("maxBytes must be a positive integer");

      const repoRootAbs = path.resolve(projectRoot, repoRootRaw || ".");
      try {
        const st = await fs.stat(repoRootAbs);
        if (!st.isDirectory()) {
          throw new Error(`repoRoot is not a directory: ${repoRootAbs}`);
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
          throw new Error(`repoRoot does not exist: ${repoRootAbs}`);
        }
        throw err;
      }

      const outputDirAbs = path.resolve(projectRoot, outputDirRaw || "./storage");
      const summary = [
        `repoRoot: ${repoRootAbs}`,
        `outputDir: ${outputDirAbs}`,
        `maxFiles: ${maxFiles}`,
        `maxBytes: ${maxBytes}`
      ];
      if (opts.clockIso) summary.push(`clockIso: ${opts.clockIso}`);
      const configPathResolved = opts.config
        ? path.resolve(projectRoot, opts.config)
        : getConfigPath(projectRoot);
      summary.push(`config: ${configPathResolved}`);

      const ok = await confirm("Write config? (Y/n)", ni);
      if (!ok) {
        console.log("Aborted.");
        return;
      }

      const createOpts: Parameters<typeof createConfig>[0] = {
        projectRoot,
        repoRoot: repoRootAbs,
        outputDir: outputDirAbs,
        maxFiles,
        maxBytes
      };
      if (opts.clockIso !== undefined) createOpts.clockIso = opts.clockIso;
      if (opts.config !== undefined) createOpts.configPath = opts.config;
      if (opts.force !== undefined) createOpts.force = opts.force;
      const configPath = await createConfig(createOpts);

      console.log("Config created:", configPath);
      summary.forEach((line) => console.log("  ", line));
      console.log("Run 'repocortex run' to run the pipeline.");
    }
  );

program
  .command("run")
  .description("Load config and run pipeline (requires init or --repo)")
  .option("--config <path>", "Path to config file (default: ./repocortex.config.json)")
  .option("--repo <path>", "Repo root (overrides config; allows run without config)")
  .option("--out <path>", "Output dir (overrides config/env)")
  .option("--max-files <n>", "Max file count (overrides config)")
  .option("--max-bytes <n>", "Max total bytes (overrides config)")
  .option("--clock-iso <iso>", "Fixed clock ISO (overrides config/env)")
  .option("--print-paths", "Print artifact paths (default: true)")
  .option("--no-print-paths", "Do not print artifact paths")
  .action(
    async (opts: {
      config?: string;
      repo?: string;
      out?: string;
      maxFiles?: string;
      maxBytes?: string;
      clockIso?: string;
      printPaths?: boolean;
    }) => {
      const cwd = process.cwd();
      const configPath = opts.config ? path.resolve(cwd, opts.config) : getConfigPath(cwd);

      let repoRoot: string;
      let outputDir: string;
      let maxFiles: number;
      let maxBytes: number;
      let clockIso: string | undefined;
      let printPaths: boolean;

      if (opts.repo) {
        repoRoot = path.resolve(cwd, opts.repo);
        outputDir = opts.out ? path.resolve(cwd, opts.out) : getStorageRoot();
        maxFiles =
          opts.maxFiles !== undefined
            ? (() => {
                const n = parseInt(opts.maxFiles!, 10);
                if (Number.isNaN(n) || n < 1)
                  throw new Error("--max-files must be a positive integer");
                return n;
              })()
            : 50_000;
        maxBytes =
          opts.maxBytes !== undefined
            ? (() => {
                const n = parseInt(opts.maxBytes!, 10);
                if (Number.isNaN(n) || n < 1)
                  throw new Error("--max-bytes must be a positive integer");
                return n;
              })()
            : 2_000_000_000;
        clockIso = opts.clockIso ?? process.env["REPOCORTEX_CLOCK_ISO"];
        printPaths = opts.printPaths ?? true;
      } else {
        let raw: unknown;
        try {
          raw = JSON.parse(await fs.readFile(configPath, "utf8")) as unknown;
        } catch (err) {
          if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
            throw new Error(
              `Config not found at ${configPath} and --repo not set. Run 'repocortex init' first.`
            );
          }
          throw err;
        }

        const { parseRepocortexConfig } = await import("../core/validate.js");
        const config = parseRepocortexConfig(raw);
        if (config.schemaVersion !== "1.0") {
          throw new Error(
            `Unsupported config schemaVersion "${config.schemaVersion}"; supported: 1.0`
          );
        }

        const projectRoot = cwd;
        const overrides: ConfigOverrides = {};
        if (opts.out !== undefined) overrides.outputDir = opts.out;
        if (opts.clockIso !== undefined) overrides.clockIso = opts.clockIso;
        if (opts.printPaths !== undefined) overrides.printPaths = opts.printPaths;
        if (opts.maxFiles !== undefined) {
          const n = parseInt(opts.maxFiles, 10);
          if (Number.isNaN(n) || n < 1) throw new Error("--max-files must be a positive integer");
          overrides.maxFiles = n;
        }
        if (opts.maxBytes !== undefined) {
          const n = parseInt(opts.maxBytes, 10);
          if (Number.isNaN(n) || n < 1) throw new Error("--max-bytes must be a positive integer");
          overrides.maxBytes = n;
        }
        const merged = mergeConfig(config, projectRoot, overrides);
        repoRoot = merged.repoRoot;
        outputDir = merged.outputDir;
        maxFiles = merged.maxFiles;
        maxBytes = merged.maxBytes;
        clockIso = merged.clockIso;
        printPaths = merged.printPaths;
      }

      try {
        await fs.access(repoRoot);
      } catch {
        throw new Error(`repoRoot does not exist: ${repoRoot}`);
      }

      const pipelineOpts: Parameters<typeof runFullPipeline>[0] = {
        repoRoot,
        outputDir,
        maxFiles,
        maxBytes
      };
      if (clockIso) pipelineOpts.clockIso = clockIso;
      const res = await runFullPipeline(pipelineOpts);

      await printRunSummary({
        repoRoot,
        snapshotId: res.snapshotId,
        artifacts: res.artifacts,
        printPaths
      });
    }
  );

program
  .command("inspect")
  .description("Show latest run summary from ledger (no new analysis)")
  .option("--config <path>", "Path to config file (default: ./repocortex.config.json)")
  .option("--out <path>", "Output dir (overrides config; for use without config)")
  .action(async (opts: { config?: string; out?: string }) => {
    const cwd = process.cwd();
    let outputDir: string;

    if (opts.out) {
      outputDir = path.resolve(cwd, opts.out);
    } else {
      const configPath = opts.config ? path.resolve(cwd, opts.config) : getConfigPath(cwd);
      try {
        const raw = JSON.parse(await fs.readFile(configPath, "utf8")) as unknown;
        const { parseRepocortexConfig } = await import("../core/validate.js");
        const config = parseRepocortexConfig(raw);
        const projectRoot = cwd;
        outputDir = path.resolve(projectRoot, config.outputDir || "./storage");
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
          throw new Error(
            `Config not found at ${opts.config ?? "repocortex.config.json"}. Use --out <path> or run 'repocortex init'.`
          );
        }
        throw err;
      }
    }

    const ledgerPath = path.join(outputDir, "ledger", "ledger.jsonl");
    let lastLine = "";
    try {
      const content = await fs.readFile(ledgerPath, "utf8");
      const lines = content.trim().split("\n").filter(Boolean);
      lastLine = lines[lines.length - 1] ?? "";
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
        throw new Error(`No ledger found at ${ledgerPath}. Run 'repocortex run' first.`);
      }
      throw err;
    }

    if (!lastLine) {
      throw new Error("Ledger is empty. Run 'repocortex run' first.");
    }

    const entry = parseLedgerEntry(JSON.parse(lastLine) as unknown);
    const snapshotId = entry.artifacts[0]?.split("/")[1] ?? "—";
    console.log("Latest run");
    console.log("----------");
    console.log("runId:", entry.runId);
    console.log("atIso:", entry.atIso);
    console.log("command:", entry.command);
    console.log("repoRoot:", entry.repoRoot);
    console.log("snapshotId:", snapshotId);
    console.log("outputHash:", entry.outputHash);
    console.log("Artifacts:", entry.artifacts.join(", "));
    const artifactPaths = printArtifacts(outputDir);
    if (artifactPaths.length) {
      console.log("Paths:");
      artifactPaths.forEach((p) => console.log("  ", path.relative(outputDir, p)));
    }

    const counts = await buildRunSummary(outputDir);
    if (
      counts.nodeCount !== undefined ||
      counts.edgeCount !== undefined ||
      counts.high !== undefined ||
      counts.medium !== undefined ||
      counts.low !== undefined
    ) {
      console.log("");
      console.log("Counts:");
      if (counts.nodeCount !== undefined) console.log("  Nodes:", counts.nodeCount);
      if (counts.edgeCount !== undefined) console.log("  Edges:", counts.edgeCount);
      if (counts.high !== undefined || counts.medium !== undefined || counts.low !== undefined) {
        console.log(
          "  Gaps — High:",
          counts.high ?? "—",
          "Medium:",
          counts.medium ?? "—",
          "Low:",
          counts.low ?? "—"
        );
      }
    }
  });

program
  .command("metrics")
  .description("Generate advanced metrics from topology (no full pipeline)")
  .option("--config <path>", "Path to config file (default: ./repocortex.config.json)")
  .option("--out <path>", "Output dir (overrides config)")
  .action(async (opts: { config?: string; out?: string }) => {
    const cwd = process.cwd();
    let outputDir: string;
    let repoRoot: string = cwd;

    if (opts.out) {
      outputDir = path.resolve(cwd, opts.out);
    } else {
      const configPath = opts.config ? path.resolve(cwd, opts.config) : getConfigPath(cwd);
      try {
        const raw = JSON.parse(await fs.readFile(configPath, "utf8")) as unknown;
        const { parseRepocortexConfig } = await import("../core/validate.js");
        const config = parseRepocortexConfig(raw);
        const projectRoot = cwd;
        outputDir = path.resolve(projectRoot, config.outputDir || "./storage");
        repoRoot = path.resolve(projectRoot, config.repoRoot || ".");
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
          throw new Error(`Config not found. Use --out <path> or run 'repocortex init'.`);
        }
        throw err;
      }
    }

    const topologyPath = path.join(outputDir, "topology", "brain_topology.json");
    try {
      await fs.access(topologyPath);
    } catch {
      throw new Error(`Topology not found at ${topologyPath}. Run 'repocortex run' first.`);
    }

    const clockIso = process.env["REPOCORTEX_CLOCK_ISO"] ?? new Date().toISOString();
    const topologyRaw = await fs.readFile(topologyPath, "utf8");
    const inputHash = sha256(topologyRaw);

    const { advancedMetricsHash, metrics } = await runAdvancedMetrics(outputDir);

    const runId = makeRunId(inputHash, clockIso);
    const artifactRel = ["advanced/advanced_metrics.json"];
    await appendLedger({
      outputDir,
      entry: {
        runId,
        atIso: clockIso,
        command: "metrics",
        repoRoot,
        inputHash,
        outputHash: advancedMetricsHash,
        artifacts: artifactRel,
        notes: [],
        advancedMetricsHash
      }
    });

    console.log("Advanced metrics written to storage/advanced/advanced_metrics.json");
    console.log("  stabilityIndex:", metrics.stabilityIndex);
    console.log("  gateways:", metrics.gateways.length);
  });

program
  .command("verify")
  .description("Verify artifact integrity (hash + schema) and write last_verification.json")
  .option("--config <path>", "Path to config file")
  .option("--out <path>", "Output dir")
  .action(async (opts: { config?: string; out?: string }) => {
    const cwd = process.cwd();
    let outputDir: string;
    if (opts.out) {
      outputDir = path.resolve(cwd, opts.out);
    } else {
      const configPath = opts.config ? path.resolve(cwd, opts.config) : getConfigPath(cwd);
      try {
        const raw = JSON.parse(await fs.readFile(configPath, "utf8")) as unknown;
        const { parseRepocortexConfig } = await import("../core/validate.js");
        const config = parseRepocortexConfig(raw);
        outputDir = path.resolve(cwd, config.outputDir || "./storage");
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
          throw new Error("Config not found. Use --out <path> or run 'repocortex init'.");
        }
        throw err;
      }
    }
    const clockIso = process.env["REPOCORTEX_CLOCK_ISO"];
    if (!clockIso) console.warn("Warning: REPOCORTEX_CLOCK_ISO not set; verify is non-deterministic.");
    const clock = getCliClock(
      clockIso ? { clockIso, mode: "best-effort" } : { mode: "best-effort" }
    );
    const verifiedAtIso = clock.nowIso();
    const { hashMatch, schemaValid } = await runVerify(outputDir, verifiedAtIso);
    console.log("Integrity:", hashMatch ? "OK" : "FAIL");
    console.log("Schemas:", schemaValid ? "OK" : "FAIL");
    console.log("Hash match:", hashMatch ? "YES" : "NO");
    if (!hashMatch || !schemaValid) process.exit(1);
  });

program
  .command("snapshot-contracts")
  .description("Write contracts snapshot (schema hashes, CLI hash, version) for drift detection")
  .option("--config <path>", "Path to config file")
  .option("--out <path>", "Output dir")
  .action(async (opts: { config?: string; out?: string }) => {
    const cwd = process.cwd();
    let outputDir: string;
    if (opts.out) {
      outputDir = path.resolve(cwd, opts.out);
    } else {
      const configPath = opts.config ? path.resolve(cwd, opts.config) : getConfigPath(cwd);
      try {
        const raw = JSON.parse(await fs.readFile(configPath, "utf8")) as unknown;
        const { parseRepocortexConfig } = await import("../core/validate.js");
        const config = parseRepocortexConfig(raw);
        outputDir = path.resolve(cwd, config.outputDir || "./storage");
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
          throw new Error("Config not found. Use --out <path> or run 'repocortex init'.");
        }
        throw err;
      }
    }
    const clockIso = process.env["REPOCORTEX_CLOCK_ISO"];
    if (!clockIso)
      console.warn("Warning: REPOCORTEX_CLOCK_ISO not set; snapshot-contracts is non-deterministic.");
    const clock = getCliClock(
      clockIso ? { clockIso, mode: "best-effort" } : { mode: "best-effort" }
    );
    const timestamp = clock.nowIso();
    const outPath = await runSnapshotContracts(outputDir, cwd, timestamp);
    console.log("Contracts snapshot written to", outPath);
  });

program
  .command("export")
  .description("Export topology to graphml, mermaid, or dot")
  .requiredOption("--format <format>", "graphml | mermaid | dot")
  .option("--config <path>", "Path to config file")
  .option("--out <path>", "Output dir")
  .action(async (opts: { format: string; config?: string; out?: string }) => {
    const cwd = process.cwd();
    let outputDir: string;
    if (opts.out) {
      outputDir = path.resolve(cwd, opts.out);
    } else {
      const configPath = opts.config ? path.resolve(cwd, opts.config) : getConfigPath(cwd);
      try {
        const raw = JSON.parse(await fs.readFile(configPath, "utf8")) as unknown;
        const { parseRepocortexConfig } = await import("../core/validate.js");
        const config = parseRepocortexConfig(raw);
        outputDir = path.resolve(cwd, config.outputDir || "./storage");
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
          throw new Error("Config not found. Use --out <path> or run 'repocortex init'.");
        }
        throw err;
      }
    }
    const format = opts.format.toLowerCase() as "graphml" | "mermaid" | "dot";
    if (!["graphml", "mermaid", "dot"].includes(format)) {
      throw new Error("--format must be graphml, mermaid, or dot");
    }
    const outPath = await runExport(outputDir, format);
    console.log("Exported to", outPath);
  });

program
  .command("impact")
  .description("Compute forward/backward reach for a node")
  .requiredOption("--node <id>", "Node id")
  .option("--save", "Write storage/analysis/impact_<nodeId>.json")
  .option("--config <path>", "Path to config file")
  .option("--out <path>", "Output dir")
  .action(async (opts: { node: string; save?: boolean; config?: string; out?: string }) => {
    const cwd = process.cwd();
    let outputDir: string;
    if (opts.out) outputDir = path.resolve(cwd, opts.out);
    else {
      const configPath = opts.config ? path.resolve(cwd, opts.config) : getConfigPath(cwd);
      const raw = JSON.parse(await fs.readFile(configPath, "utf8")) as unknown;
      const { parseRepocortexConfig } = await import("../core/validate.js");
      const config = parseRepocortexConfig(raw);
      outputDir = path.resolve(cwd, config.outputDir || "./storage");
    }
    const topologyPath = path.join(outputDir, "topology", "brain_topology.json");
    const raw = await fs.readFile(topologyPath, "utf8");
    const { parseBrainTopology } = await import("../core/validate.js");
    const topology = parseBrainTopology(JSON.parse(raw) as unknown);
    const result = computeImpact(topology, opts.node);
    console.log("Forward reach:", result.forwardCount);
    console.log("Backward reach:", result.backwardCount);
    console.log("Top 10 nodes:");
    result.topNodes.forEach((n) =>
      console.log(`  ${n.nodeId}  forward=${n.forward} backward=${n.backward} total=${n.total}`)
    );
    if (opts.save) {
      const report = validateOrThrow(ImpactReportSchema, {
        schemaVersion: "1.0",
        nodeId: opts.node,
        forwardCount: result.forwardCount,
        backwardCount: result.backwardCount,
        topNodes: result.topNodes
      });
      await ensureDir(path.join(outputDir, "analysis"));
      const outPath = path.join(
        outputDir,
        "analysis",
        `impact_${opts.node.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`
      );
      await writeJsonAtomic(outPath, report, outputDir);
      console.log("Saved to", outPath);
    }
  });

program
  .command("duplicates")
  .description("Detect near-duplicate files (simhash, hamming <= 3)")
  .option("--config <path>", "Path to config file")
  .option("--out <path>", "Output dir")
  .action(async (opts: { config?: string; out?: string }) => {
    const cwd = process.cwd();
    let outputDir: string;
    let repoRoot: string;
    if (opts.out) {
      outputDir = path.resolve(cwd, opts.out);
      repoRoot = cwd;
    } else {
      const configPath = opts.config ? path.resolve(cwd, opts.config) : getConfigPath(cwd);
      const raw = JSON.parse(await fs.readFile(configPath, "utf8")) as unknown;
      const { parseRepocortexConfig } = await import("../core/validate.js");
      const config = parseRepocortexConfig(raw);
      outputDir = path.resolve(cwd, config.outputDir || "./storage");
      repoRoot = path.resolve(cwd, config.repoRoot || ".");
    }
    const { getSnapshotIds } = await import("../utils/paths.js");
    const ids = await getSnapshotIds(outputDir);
    if (ids.length === 0) throw new Error("No snapshots found. Run 'repocortex run' first.");
    const paths = getStoragePaths(outputDir, ids[ids.length - 1]!);
    const { readJson } = await import("../core/io.js");
    const { parseFileIndex } = await import("../core/validate.js");
    const rawFileIndex = await readJson(paths.fileIndex);
    const fileIndex = parseFileIndex(rawFileIndex);
    const outPath = await runDuplicateDetector(outputDir, repoRoot, fileIndex);
    console.log("Duplicates written to", outPath);
  });

program
  .command("health")
  .description("Print structural health summary (no writes)")
  .option("--config <path>", "Path to config file")
  .option("--out <path>", "Output dir")
  .action(async (opts: { config?: string; out?: string }) => {
    const cwd = process.cwd();
    let outputDir: string;
    if (opts.out) outputDir = path.resolve(cwd, opts.out);
    else {
      const configPath = opts.config ? path.resolve(cwd, opts.config) : getConfigPath(cwd);
      const raw = JSON.parse(await fs.readFile(configPath, "utf8")) as unknown;
      const { parseRepocortexConfig } = await import("../core/validate.js");
      const config = parseRepocortexConfig(raw);
      outputDir = path.resolve(cwd, config.outputDir || "./storage");
    }
    const summary = await computeHealthSummary(outputDir);
    console.log("System Health Score:", summary.systemHealthScore);
    console.log("Gateway Nodes:", summary.gatewayNodes);
    console.log("Duplicate Pairs:", summary.duplicatePairs);
    console.log("Structural Density:", summary.structuralDensity);
  });

program
  .command("diff")
  .description("Diff two snapshots")
  .option("--snapshot <id>", "Snapshot id (pass twice)", (v: string, prev: string[]) =>
    (prev ?? []).concat(v)
  )
  .option("--config <path>", "Path to config file")
  .option("--out <path>", "Output dir")
  .action(async (opts: { snapshot?: string[]; config?: string; out?: string }) => {
    const cwd = process.cwd();
    let outputDir: string;
    if (opts.out) outputDir = path.resolve(cwd, opts.out);
    else {
      const configPath = opts.config ? path.resolve(cwd, opts.config) : getConfigPath(cwd);
      const raw = JSON.parse(await fs.readFile(configPath, "utf8")) as unknown;
      const { parseRepocortexConfig } = await import("../core/validate.js");
      const config = parseRepocortexConfig(raw);
      outputDir = path.resolve(cwd, config.outputDir || "./storage");
    }
    const ids = opts.snapshot ?? [];
    if (ids.length < 2)
      throw new Error("Need exactly two --snapshot <id> (e.g. --snapshot id1 --snapshot id2)");
    const outPath = await runDiff(outputDir, ids[0]!, ids[1]!);
    console.log("Diff written to", outPath);
  });

program
  .command("scan")
  .requiredOption("--repo <path>", "Path to repo root")
  .option("--out <path>", "Output dir (default: ./storage)")
  .option("--force", "Allow run when repo exceeds --max-files / --max-bytes")
  .option("--max-files <n>", "Max file count (default: 50000); over requires --force")
  .option("--max-bytes <n>", "Max total bytes (default: 2GB); over requires --force")
  .action(async (opts: { repo: string; out?: string } & ScanGuardOpts) => {
    const repoRoot = path.resolve(opts.repo);
    const outputDir = mustOutDir(opts.out);
    const clock = getCliClock({ mode: "best-effort" });
    const guards = parseScanGuards(opts);

    const scanOpts: Parameters<typeof scanRepo>[0] = {
      repoRoot,
      outputDir,
      clock,
      force: guards.force
    };
    if (guards.maxFiles !== undefined) scanOpts.maxFiles = guards.maxFiles;
    if (guards.maxBytes !== undefined) scanOpts.maxBytes = guards.maxBytes;
    const res = await scanRepo(scanOpts);
    const paths = getStoragePaths(outputDir, res.snapshotId);

    const runId = makeRunId(res.inputHash, clock.nowIso());
    const artifactRel = [path.relative(outputDir, paths.fileIndex)];
    const outputHash = await computeOutputHash(outputDir, artifactRel);

    await appendLedger({
      outputDir,
      entry: {
        runId,
        atIso: clock.nowIso(),
        command: "scan",
        repoRoot,
        inputHash: res.inputHash,
        outputHash,
        artifacts: artifactRel,
        notes: []
      }
    });

    console.log(`snapshotId=${res.snapshotId}`);
  });

program
  .command("map")
  .requiredOption("--repo <path>", "Path to repo root")
  .option("--out <path>", "Output dir (default: ./storage)")
  .option("--force", "Allow run when repo exceeds --max-files / --max-bytes")
  .option("--max-files <n>", "Max file count (default: 50000); over requires --force")
  .option("--max-bytes <n>", "Max total bytes (default: 2GB); over requires --force")
  .action(async (opts: { repo: string; out?: string } & ScanGuardOpts) => {
    const repoRoot = path.resolve(opts.repo);
    const outputDir = mustOutDir(opts.out);
    const clock = getCliClock({ mode: "best-effort" });
    const guards = parseScanGuards(opts);

    const scanOpts: Parameters<typeof scanRepo>[0] = {
      repoRoot,
      outputDir,
      clock,
      force: guards.force
    };
    if (guards.maxFiles !== undefined) scanOpts.maxFiles = guards.maxFiles;
    if (guards.maxBytes !== undefined) scanOpts.maxBytes = guards.maxBytes;
    const scan = await scanRepo(scanOpts);
    const paths = getStoragePaths(outputDir, scan.snapshotId);
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
    await buildTopology({
      outputDir,
      depGraph,
      runtimeSignals: runtime,
      _symbolIndex: symbolIndex
    });

    const artifactRel = [
      path.relative(outputDir, paths.fileIndex),
      "facts/runtimeSignals.json",
      "facts/depGraph.json",
      "facts/symbolIndex.json",
      "topology/brain_topology.json",
      "topology/flows.json"
    ];
    const outputHash = await computeOutputHash(outputDir, artifactRel);
    const runId = makeRunId(scan.inputHash, clock.nowIso());

    await appendLedger({
      outputDir,
      entry: {
        runId,
        atIso: clock.nowIso(),
        command: "map",
        repoRoot,
        inputHash: scan.inputHash,
        outputHash,
        artifacts: artifactRel,
        notes: []
      }
    });

    console.log("map: ok");
  });

program
  .command("gaps")
  .requiredOption("--repo <path>", "Path to repo root")
  .option("--out <path>", "Output dir (default: ./storage)")
  .option("--force", "Allow run when repo exceeds --max-files / --max-bytes")
  .option("--max-files <n>", "Max file count (default: 50000); over requires --force")
  .option("--max-bytes <n>", "Max total bytes (default: 2GB); over requires --force")
  .action(async (opts: { repo: string; out?: string } & ScanGuardOpts) => {
    const repoRoot = path.resolve(opts.repo);
    const outputDir = mustOutDir(opts.out);
    const clock = getCliClock({ mode: "best-effort" });
    const guards = parseScanGuards(opts);

    const scanOptsGaps: Parameters<typeof scanRepo>[0] = {
      repoRoot,
      outputDir,
      clock,
      force: guards.force
    };
    if (guards.maxFiles !== undefined) scanOptsGaps.maxFiles = guards.maxFiles;
    if (guards.maxBytes !== undefined) scanOptsGaps.maxBytes = guards.maxBytes;
    const scan = await scanRepo(scanOptsGaps);
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
    const testsExist = await hasAnyTests(repoRoot);
    await detectGaps({
      outputDir,
      depGraph,
      runtimeSignals: runtime,
      topology,
      hasTests: testsExist
    });

    const artifactRel = ["analysis/gaps_report.json", "analysis/gaps_report.md"];
    const outputHash = await computeOutputHash(outputDir, artifactRel);
    const runId = makeRunId(scan.inputHash, clock.nowIso());

    await appendLedger({
      outputDir,
      entry: {
        runId,
        atIso: clock.nowIso(),
        command: "gaps",
        repoRoot,
        inputHash: scan.inputHash,
        outputHash,
        artifacts: artifactRel,
        notes: []
      }
    });

    console.log("gaps: ok");
  });

program
  .command("essence")
  .requiredOption("--repo <path>", "Path to repo root")
  .option("--out <path>", "Output dir (default: ./storage)")
  .option("--force", "Allow run when repo exceeds --max-files / --max-bytes")
  .option("--max-files <n>", "Max file count (default: 50000); over requires --force")
  .option("--max-bytes <n>", "Max total bytes (default: 2GB); over requires --force")
  .action(async (opts: { repo: string; out?: string } & ScanGuardOpts) => {
    const repoRoot = path.resolve(opts.repo);
    const outputDir = mustOutDir(opts.out);
    const clock = getCliClock({ mode: "best-effort" });
    const guards = parseScanGuards(opts);

    const scanOptsEssence: Parameters<typeof scanRepo>[0] = {
      repoRoot,
      outputDir,
      clock,
      force: guards.force
    };
    if (guards.maxFiles !== undefined) scanOptsEssence.maxFiles = guards.maxFiles;
    if (guards.maxBytes !== undefined) scanOptsEssence.maxBytes = guards.maxBytes;
    const scan = await scanRepo(scanOptsEssence);
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
    const testsExist = await hasAnyTests(repoRoot);
    const gaps = await detectGaps({
      outputDir,
      depGraph,
      runtimeSignals: runtime,
      topology,
      hasTests: testsExist
    });
    await generateEssence({ outputDir, topology, gaps });

    const artifactRel = ["essence/pack.json", "essence/pack.md"];
    const outputHash = await computeOutputHash(outputDir, artifactRel);
    const runId = makeRunId(scan.inputHash, clock.nowIso());

    await appendLedger({
      outputDir,
      entry: {
        runId,
        atIso: clock.nowIso(),
        command: "essence",
        repoRoot,
        inputHash: scan.inputHash,
        outputHash,
        artifacts: artifactRel,
        notes: []
      }
    });

    console.log("essence: ok");
  });



program
  .command("self")
  .description("Run pipeline on current repo root (requires deterministic clock)")
  .option("--out <path>", "Output dir (default: ./storage)")
  .option("--force", "Allow run when repo exceeds --max-files / --max-bytes")
  .option("--max-files <n>", "Max file count (default: 50000); over requires --force")
  .option("--max-bytes <n>", "Max total bytes (default: 2GB); over requires --force")
  .option("--clock-iso <iso>", "Fixed clock ISO (required for determinism)")
  .action(async (opts: { out?: string; clockIso?: string } & ScanGuardOpts) => {
    const repoRoot = process.cwd();
    const outputDir = mustOutDir(opts.out);
    const guards = parseScanGuards(opts);
    const clockIso = opts.clockIso ?? process.env["REPOCORTEX_CLOCK_ISO"];
    if (!clockIso) {
      throw new Error("Deterministic clock required. Pass --clock-iso or set REPOCORTEX_CLOCK_ISO.");
    }
    const pipelineOpts: Parameters<typeof runFullPipeline>[0] = {
      repoRoot,
      outputDir,
      force: guards.force,
      clockIso
    };
    if (guards.maxFiles !== undefined) pipelineOpts.maxFiles = guards.maxFiles;
    if (guards.maxBytes !== undefined) pipelineOpts.maxBytes = guards.maxBytes;
    const res = await runFullPipeline(pipelineOpts);
    console.log(`self: ok runId=${res.runId} snapshotId=${res.snapshotId}`);
  });

program
  .command("pipeline")
  .requiredOption("--repo <path>", "Path to repo root")
  .option("--out <path>", "Output dir (default: ./storage)")
  .option("--force", "Allow run when repo exceeds --max-files / --max-bytes")
  .option("--max-files <n>", "Max file count (default: 50000); over requires --force")
  .option("--max-bytes <n>", "Max total bytes (default: 2GB); over requires --force")
  .action(async (opts: { repo: string; out?: string } & ScanGuardOpts) => {
    const repoRoot = path.resolve(opts.repo);
    const outputDir = mustOutDir(opts.out);
    const guards = parseScanGuards(opts);
    const pipelineOpts: Parameters<typeof runFullPipeline>[0] = {
      repoRoot,
      outputDir,
      force: guards.force
    };
    if (guards.maxFiles !== undefined) pipelineOpts.maxFiles = guards.maxFiles;
    if (guards.maxBytes !== undefined) pipelineOpts.maxBytes = guards.maxBytes;
    const clockIso = process.env["REPOCORTEX_CLOCK_ISO"];
    if (clockIso) pipelineOpts.clockIso = clockIso;
    const res = await runFullPipeline(pipelineOpts);
    console.log(`pipeline: ok runId=${res.runId} snapshotId=${res.snapshotId}`);
  });

program
  .command("audit")
  .option("--cheap", "Run cheap audit (stub)")
  .requiredOption("--budget-sek <n>", "Max budget in SEK")
  .option("--out <path>", "Output dir (default: ./storage)")
  .action(async (opts: { cheap?: boolean; budgetSek: string; out?: string }) => {
    const budget = Number(opts.budgetSek);
    if (!Number.isFinite(budget) || budget <= 0)
      throw new Error("budget-sek must be a positive number");
    if (!opts.cheap) throw new Error("Only --cheap is supported in MVP (stub)");
    if (budget > 5) throw new Error("Cheap audit budget cannot exceed 5 SEK in MVP (guardrail)");

    const outputDir = mustOutDir(opts.out);
    console.log(`audit:cheap (stub) budget-sek=${budget} outputDir=${outputDir}`);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
