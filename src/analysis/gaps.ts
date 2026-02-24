import path from "node:path";
import type { DepGraph } from "../schemas/depGraph.schema.js";
import type { FileIndex } from "../schemas/fileIndex.schema.js";
import type { GapsReport, GapItem } from "../schemas/gapsReport.schema.js";
import type { RuntimeSignals } from "../schemas/runtimeSignals.schema.js";
import { ensureDir, writeJsonAtomic, validateOrThrow } from "../core/io.js";
import { GapsReportSchema } from "../schemas/gapsReport.schema.js";

// Sort order: critical > high > medium > low, then title lexicographically
const SEVERITY_ORDER: Record<GapItem["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};

function compareGaps(a: GapItem, b: GapItem): number {
  const sa = SEVERITY_ORDER[a.severity];
  const sb = SEVERITY_ORDER[b.severity];
  if (sa !== sb) return sa - sb;
  return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
}

/** Tarjan's SCC: returns list of components with more than one node (cycles). */
function scc(nodeIds: string[], edges: { from: string; to: string }[]): string[][] {
  const nodeToI = new Map<string, number>();
  nodeIds.forEach((id, i) => nodeToI.set(id, i));
  const adj: number[][] = nodeIds.map(() => []);
  for (const e of edges) {
    const i = nodeToI.get(e.from);
    const j = nodeToI.get(e.to);
    if (i === undefined || j === undefined) continue;
    adj[i]!.push(j);
  }
  let dfsIdx = 0;
  const dfsNum: number[] = nodeIds.map(() => -1);
  const low: number[] = nodeIds.map(() => -1);
  const stack: number[] = [];
  const onStack: boolean[] = nodeIds.map(() => false);
  const result: string[][] = [];

  function strong(v: number): void {
    dfsNum[v] = dfsIdx;
    low[v] = dfsIdx++;
    stack.push(v);
    onStack[v] = true;

    for (const w of adj[v]!) {
      if (dfsNum[w] === -1) {
        strong(w);
        low[v] = Math.min(low[v], low[w]!);
      } else if (onStack[w]) {
        low[v] = Math.min(low[v], dfsNum[w]!);
      }
    }

    if (low[v] === dfsNum[v]) {
      const comp: string[] = [];
      let w: number;
      do {
        w = stack.pop()!;
        onStack[w] = false;
        comp.push(nodeIds[w]!);
      } while (w !== v);
      if (comp.length > 1) result.push(comp.sort());
    }
  }

  for (let i = 0; i < nodeIds.length; i++) {
    if (dfsNum[i] === -1) strong(i);
  }

  return result;
}

export async function detectGaps(params: {
  outputDir: string;
  fileIndex: FileIndex;
  depGraph: DepGraph;
  runtimeSignals: RuntimeSignals;
}): Promise<GapsReport> {
  const outputDir = path.resolve(params.outputDir);
  const gaps: GapItem[] = [];
  const nodeSet = new Set(params.depGraph.nodes);

  // 1) Cyclic dependencies (SCC) — only edges where to is exact node path
  const localEdges = params.depGraph.edges.filter((e) => nodeSet.has(e.to));
  const cycles = scc(params.depGraph.nodes, localEdges);
  for (const comp of cycles) {
    gaps.push({
      id: `gap-cycle-${comp.join("-").replace(/\//g, "_")}`,
      severity: "medium",
      title: "Cyclic dependency (SCC)",
      evidence: comp.map((file) => ({ file, note: "part of cycle" }))
    });
  }

  // 2) 0.0.0.0 bind without opt-in
  for (const s of params.runtimeSignals.signals) {
    if (s.kind === "bindAllInterfaces") {
      gaps.push({
        id: `gap-bind-${s.file}:${s.line}`,
        severity: "high",
        title: "0.0.0.0 bind without opt-in",
        evidence: [{ file: s.file, line: s.line, note: s.snippet }]
      });
    }
  }

  // Net exposure (httpServer, netListen, wsUpgrade — not bindAllInterfaces, which is high)
  const NET_EXPOSURE_KINDS = new Set(["httpServer", "httpsServer", "netListen", "wsUpgrade"]);
  for (const s of params.runtimeSignals.signals) {
    if (NET_EXPOSURE_KINDS.has(s.kind)) {
      gaps.push({
        id: `gap-net-${s.file}:${s.line}`,
        severity: "medium",
        title: "Net exposure (listen/serve)",
        evidence: [{ file: s.file, line: s.line, note: s.snippet }]
      });
    }
  }

  // Writes without ledger pattern
  for (const s of params.runtimeSignals.signals) {
    if (s.kind === "fsWrite") {
      gaps.push({
        id: `gap-write-${s.file}:${s.line}`,
        severity: "medium",
        title: "Writes without ledger pattern",
        evidence: [{ file: s.file, line: s.line, note: s.snippet }]
      });
    }
  }

  // 4) Exec path without policy gate
  for (const s of params.runtimeSignals.signals) {
    if (s.kind === "spawn" || s.kind === "exec") {
      gaps.push({
        id: `gap-exec-${s.file}:${s.line}`,
        severity: "high",
        title: "Exec path without policy gate",
        evidence: [{ file: s.file, line: s.line, note: s.snippet }]
      });
    }
  }

  // 5) Modules without tests
  const hasSrc = params.fileIndex.files.some(
    (f) => f.path.startsWith("src/") && /\.(ts|js)$/.test(f.path)
  );
  const hasTestDir = params.fileIndex.files.some(
    (f) => f.path.includes("test") || f.path.includes("spec")
  );
  const hasTestFiles = params.fileIndex.files.some((f) => /\.(test|spec)\.(ts|js)$/.test(f.path));
  if (hasSrc && !hasTestDir && !hasTestFiles) {
    gaps.push({
      id: "gap-no-tests",
      severity: "low",
      title: "Modules without tests",
      evidence: [{ file: "repo", note: "No test folder or *.test.ts / *.spec.ts found" }]
    });
  }

  gaps.sort(compareGaps);

  const summary = {
    critical: gaps.filter((g) => g.severity === "critical").length,
    high: gaps.filter((g) => g.severity === "high").length,
    medium: gaps.filter((g) => g.severity === "medium").length,
    low: gaps.filter((g) => g.severity === "low").length
  };

  const report = validateOrThrow(GapsReportSchema, { schemaVersion: "1.0", summary, gaps });

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
