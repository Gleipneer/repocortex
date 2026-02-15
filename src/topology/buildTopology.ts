import path from "node:path";
import { writeJsonAtomic, validateOrThrow } from "../core/io.js";
import type { DepGraph } from "../schemas/depGraph.schema.js";
import type { SymbolIndex } from "../schemas/symbolIndex.schema.js";
import type { RuntimeSignals } from "../schemas/runtimeSignals.schema.js";
import {
  BrainTopologySchema,
  FlowsSchema,
  type BrainTopology,
  type Flows
} from "../schemas/topology.schema.js";

function flagsFromSignals(kinds: Set<string>): string[] {
  const flags = new Set<string>();
  for (const k of kinds) {
    if (k.includes("Server") || k === "netListen" || k === "bindAllInterfaces" || k === "wsUpgrade")
      flags.add("net-exposure");
    if (k === "fsWrite") flags.add("writes");
    if (k === "spawn" || k === "exec") flags.add("exec");
    if (k === "envMutation") flags.add("env-mutation");
    if (k === "chokidarWatch") flags.add("watcher");
    if (k === "setInterval" || k === "setTimeout") flags.add("timers");
  }
  return Array.from(flags).sort();
}

export async function buildTopology(params: {
  outputDir: string;
  depGraph: DepGraph;
  runtimeSignals: RuntimeSignals;
  _symbolIndex: SymbolIndex;
}): Promise<{ topology: BrainTopology; flows: Flows }> {
  const outputDir = path.resolve(params.outputDir);

  const signalsByFile = new Map<string, Set<string>>();
  for (const s of params.runtimeSignals.signals) {
    const set = signalsByFile.get(s.file) ?? new Set<string>();
    set.add(s.kind);
    signalsByFile.set(s.file, set);
  }

  const nodeIds = [...params.depGraph.nodes].sort((a, b) => (a < b ? -1 : 1));
  const nodeSet = new Set(nodeIds);

  // Only edges whose endpoints are both in topology.nodes (no external endpoint inflation).
  const inRepoEdges = params.depGraph.edges.filter((e) => nodeSet.has(e.from) && nodeSet.has(e.to));

  // degree centrality (out-degree from in-repo edges only)
  const deg = new Map<string, number>();
  for (const n of nodeIds) deg.set(n, 0);
  for (const e of inRepoEdges) {
    deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
  }
  const maxDeg = Math.max(1, ...Array.from(deg.values()));

  const nodes = nodeIds.map((id) => {
    const kinds = signalsByFile.get(id) ?? new Set<string>();
    const riskFlags = flagsFromSignals(kinds);
    return {
      id,
      label: id,
      kind: "module" as const,
      riskFlags,
      centrality: (deg.get(id) ?? 0) / maxDeg
    };
  });

  const edges = inRepoEdges
    .map((e) => ({
      from: e.from,
      to: e.to,
      kind: "imports" as const,
      riskFlags: [] as string[] // in-repo only; no external-dep on these edges
    }))
    .sort((a, b) =>
      a.from !== b.from
        ? a.from < b.from
          ? -1
          : 1
        : a.to !== b.to
          ? a.to < b.to
            ? -1
            : 1
          : a.kind < b.kind
            ? -1
            : 1
    );

  const topology = validateOrThrow(BrainTopologySchema, {
    schemaVersion: "1.0",
    nodes,
    edges,
    metrics: { nodeCount: nodes.length, edgeCount: edges.length }
  });

  const flowsArr: Flows["flows"] = [];
  for (const n of nodes) {
    const f = new Set(n.riskFlags);
    if (f.has("net-exposure"))
      flowsArr.push({ id: `flow:${n.id}:net`, path: [n.id], kind: "net", riskFlags: n.riskFlags });
    if (f.has("writes"))
      flowsArr.push({
        id: `flow:${n.id}:write`,
        path: [n.id],
        kind: "write",
        riskFlags: n.riskFlags
      });
    if (f.has("exec"))
      flowsArr.push({
        id: `flow:${n.id}:exec`,
        path: [n.id],
        kind: "exec",
        riskFlags: n.riskFlags
      });
  }

  flowsArr.sort((a, b) => (a.id < b.id ? -1 : 1));

  const flows = validateOrThrow(FlowsSchema, { schemaVersion: "1.0", flows: flowsArr });

  await writeJsonAtomic(
    path.join(outputDir, "topology", "brain_topology.json"),
    topology,
    outputDir
  );
  await writeJsonAtomic(path.join(outputDir, "topology", "flows.json"), flows, outputDir);

  return { topology, flows };
}
