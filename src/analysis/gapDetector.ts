import path from "node:path";
import { ensureDir, writeJsonAtomic, validateOrThrow } from "../core/io.js";
import type { DepGraph } from "../schemas/depGraph.schema.js";
import type { RuntimeSignals } from "../schemas/runtimeSignals.schema.js";
import type { BrainTopology } from "../schemas/topology.schema.js";
import { GapsReportSchema, type GapsReport } from "../schemas/gapsReport.schema.js";

type Severity = "low" | "medium" | "high" | "critical";

const severityRank: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
};

function sortGaps(gaps: GapsReport["gaps"]): GapsReport["gaps"] {
  return [...gaps].sort((a, b) => {
    const s = severityRank[b.severity] - severityRank[a.severity];
    if (s !== 0) return s;
    return a.title < b.title ? -1 : 1;
  });
}

// Basic SCC (Tarjan) for exact node matches only
function findCycles(nodes: string[], edges: DepGraph["edges"]): string[][] {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n, []);
  for (const e of edges) {
    if (adj.has(e.to)) {
      adj.get(e.from)?.push(e.to);
    }
  }

  const indexMap = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  let index = 0;
  const sccs: string[][] = [];

  function strongconnect(v: string): void {
    indexMap.set(v, index);
    lowlink.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) ?? []) {
      if (!indexMap.has(w)) {
        strongconnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, indexMap.get(w)!));
      }
    }

    if (lowlink.get(v) === indexMap.get(v)) {
      const comp: string[] = [];
      let w: string | undefined;
      do {
        w = stack.pop();
        if (!w) break;
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) sccs.push(comp.sort());
    }
  }

  for (const n of nodes) if (!indexMap.has(n)) strongconnect(n);

  return sccs.sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""));
}

export async function detectGaps(params: {
  outputDir: string;
  depGraph: DepGraph;
  runtimeSignals: RuntimeSignals;
  topology: BrainTopology;
  hasTests: boolean;
}): Promise<GapsReport> {
  const outputDir = path.resolve(params.outputDir);
  const gaps: GapsReport["gaps"] = [];

  const signals = params.runtimeSignals.signals;

  if (signals.some((s) => s.kind === "bindAllInterfaces")) {
    gaps.push({
      id: "bind-all-interfaces",
      severity: "high",
      title: "Server binds to 0.0.0.0 without explicit opt-in",
      evidence: signals
        .filter((s) => s.kind === "bindAllInterfaces")
        .map((s) => ({ file: s.file, line: s.line, note: s.snippet }))
    });
  }

  if (signals.some((s) => s.kind === "spawn" || s.kind === "exec")) {
    gaps.push({
      id: "exec-without-policy",
      severity: "high",
      title: "Process execution detected without policy gate",
      evidence: signals
        .filter((s) => s.kind === "spawn" || s.kind === "exec")
        .map((s) => ({ file: s.file, line: s.line, note: s.snippet }))
    });
  }

  if (signals.some((s) => s.kind === "fsWrite")) {
    gaps.push({
      id: "writes-without-ledger",
      severity: "medium",
      title: "Writes without ledger pattern",
      evidence: signals
        .filter((s) => s.kind === "fsWrite")
        .map((s) => ({ file: s.file, line: s.line, note: s.snippet }))
    });
  }

  const netKinds = new Set(["httpServer", "httpsServer", "netListen", "wsUpgrade"]);
  if (signals.some((s) => netKinds.has(s.kind))) {
    gaps.push({
      id: "net-exposure",
      severity: "medium",
      title: "Net exposure (listen/serve)",
      evidence: signals
        .filter((s) => netKinds.has(s.kind))
        .map((s) => ({ file: s.file, line: s.line, note: s.snippet }))
    });
  }

  const cycles = findCycles(params.depGraph.nodes, params.depGraph.edges);
  for (const comp of cycles) {
    gaps.push({
      id: `cycle-${comp.join("-").replace(/\//g, "_")}`,
      severity: "medium",
      title: "Cyclic dependency (SCC)",
      evidence: comp.map((file) => ({ file, note: "part of cycle" }))
    });
  }

  if (!params.hasTests) {
    gaps.push({
      id: "modules-without-tests",
      severity: "low",
      title: "Modules without tests",
      evidence: [{ file: "repo", note: "No test folder or *.test.ts / *.spec.ts found" }]
    });
  }

  const sorted = sortGaps(gaps);
  const summary = {
    critical: sorted.filter((g) => g.severity === "critical").length,
    high: sorted.filter((g) => g.severity === "high").length,
    medium: sorted.filter((g) => g.severity === "medium").length,
    low: sorted.filter((g) => g.severity === "low").length
  };

  const report = validateOrThrow(GapsReportSchema, { schemaVersion: "1.0", summary, gaps: sorted });

  const jsonPath = path.join(outputDir, "analysis", "gaps_report.json");
  const mdPath = path.join(outputDir, "analysis", "gaps_report.md");
  await writeJsonAtomic(jsonPath, report, outputDir);

  const mdLines: string[] = ["# Gaps Report", "", "| Severity | Title |", "|----------|-------|"];
  for (const g of report.gaps) {
    mdLines.push(`| ${g.severity} | ${g.title} |`);
  }
  mdLines.push("");
  for (const g of report.gaps) {
    mdLines.push(`## ${g.title} (${g.severity})`, "");
    for (const e of g.evidence) {
      mdLines.push(`- ${e.file}${e.line != null ? `:${e.line}` : ""} — ${e.note}`);
    }
    mdLines.push("");
  }
  const { writeFileAtomic } = await import("../core/io.js");
  await ensureDir(path.dirname(mdPath));
  await writeFileAtomic(mdPath, mdLines.join("\n"));

  return report;
}
