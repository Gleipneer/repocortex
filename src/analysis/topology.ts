import path from "node:path";
import type { DepGraph } from "../schemas/depGraph.schema.js";
import type { RuntimeSignals } from "../schemas/runtimeSignals.schema.js";
import type { SymbolIndex } from "../schemas/symbolIndex.schema.js";
import type { BrainTopology, TopologyEdge, TopologyNode } from "../schemas/topology.schema.js";
import type { Flows } from "../schemas/topology.schema.js";
import { writeJsonAtomic, validateOrThrow } from "../core/io.js";
import { BrainTopologySchema, FlowsSchema } from "../schemas/topology.schema.js";

const NET_SIGNAL_KINDS = new Set([
  "httpServer",
  "httpsServer",
  "wsUpgrade",
  "netListen",
  "bindAllInterfaces"
]);

function signalKindsToRiskFlags(kinds: Set<string>): string[] {
  const flags: string[] = [];
  if (
    kinds.has("httpServer") ||
    kinds.has("httpsServer") ||
    kinds.has("netListen") ||
    kinds.has("bindAllInterfaces")
  )
    flags.push("net-exposure");
  if (kinds.has("fsWrite")) flags.push("writes");
  if (kinds.has("spawn") || kinds.has("exec")) flags.push("exec");
  if (kinds.has("setInterval") || kinds.has("setTimeout")) flags.push("timers");
  if (kinds.has("envMutation")) flags.push("env-mutation");
  return flags.sort();
}

function resolveSpecifierToNode(
  fromPath: string,
  spec: string,
  nodeSet: Set<string>
): string | null {
  if (spec.startsWith(".") || spec.startsWith("/")) {
    const dir = path.dirname(fromPath);
    const joined = path.join(dir, spec).split(path.sep).join("/");
    const normalized = path.normalize(joined).split(path.sep).join("/");
    if (nodeSet.has(normalized)) return normalized;
    const noExt = normalized.replace(/\.[^.]+$/, "");
    for (const n of nodeSet) {
      if (n.replace(/\.[^.]+$/, "") === noExt) return n;
    }
  }
  return null;
}

export async function buildTopology(params: {
  outputDir: string;
  depGraph: DepGraph;
  runtimeSignals: RuntimeSignals;
  symbolIndex: SymbolIndex;
}): Promise<{ brainTopology: BrainTopology; flows: Flows }> {
  const outputDir = path.resolve(params.outputDir);
  const { depGraph, runtimeSignals } = params;

  const nodeSet = new Set(depGraph.nodes);

  const signalsByFile = new Map<string, Set<string>>();
  for (const s of runtimeSignals.signals) {
    let set = signalsByFile.get(s.file);
    if (!set) {
      set = new Set<string>();
      signalsByFile.set(s.file, set);
    }
    set.add(s.kind);
  }

  const topologyEdges: TopologyEdge[] = [];
  for (const e of depGraph.edges) {
    if (e.isExternal) continue;
    const toId = resolveSpecifierToNode(e.from, e.to, nodeSet);
    if (toId) topologyEdges.push({ from: e.from, to: toId, kind: "imports", riskFlags: [] });
  }
  topologyEdges.sort((a, b) =>
    a.from !== b.from ? (a.from < b.from ? -1 : 1) : a.to !== b.to ? (a.to < b.to ? -1 : 1) : 0
  );

  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  for (const n of depGraph.nodes) {
    inDegree.set(n, 0);
    outDegree.set(n, 0);
  }
  for (const e of topologyEdges) {
    outDegree.set(e.from, (outDegree.get(e.from) ?? 0) + 1);
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
  }

  const maxDegree = Math.max(depGraph.nodes.length - 1, 1);
  const nodes: TopologyNode[] = depGraph.nodes.map((id) => {
    const label = path.basename(id);
    const kinds = signalsByFile.get(id) ?? new Set<string>();
    const riskFlags = signalKindsToRiskFlags(kinds);
    const inD = inDegree.get(id) ?? 0;
    const outD = outDegree.get(id) ?? 0;
    const centrality = (inD + outD) / maxDegree;
    return { id, label, kind: "module", riskFlags, centrality };
  });
  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const brainTopology = validateOrThrow(BrainTopologySchema, {
    schemaVersion: "1.0",
    nodes,
    edges: topologyEdges,
    metrics: { nodeCount: nodes.length, edgeCount: topologyEdges.length }
  });

  const flows: Flows["flows"] = [];
  let flowId = 0;
  for (const n of nodes) {
    const kinds = signalsByFile.get(n.id) ?? new Set<string>();
    const hasNet = [...NET_SIGNAL_KINDS].some((k) => kinds.has(k));
    const hasWrite = kinds.has("fsWrite");
    let flowKind: Flows["flows"][number]["kind"] = "unknown";
    const flowRiskFlags: string[] = [];
    if (hasNet && hasWrite) {
      flowKind = "mixed";
      flowRiskFlags.push("net-exposure", "writes");
    } else if (hasNet) {
      flowKind = "net";
      flowRiskFlags.push("net-exposure");
    } else if (hasWrite) {
      flowKind = "write";
      flowRiskFlags.push("writes");
    }
    if (flowKind !== "unknown") {
      flows.push({
        id: `flow-${flowId++}`,
        path: [n.id],
        kind: flowKind,
        riskFlags: flowRiskFlags
      });
    }
  }
  flows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const flowsOut = validateOrThrow(FlowsSchema, {
    schemaVersion: "1.0",
    flows
  });

  await writeJsonAtomic(
    path.join(outputDir, "topology", "brain_topology.json"),
    brainTopology,
    outputDir
  );
  await writeJsonAtomic(path.join(outputDir, "topology", "flows.json"), flowsOut, outputDir);

  return { brainTopology, flows: flowsOut };
}
