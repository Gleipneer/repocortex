import type { BrainTopology } from "../schemas/topology.schema.js";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeDot(s: string): string {
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) return s;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Deterministic: nodes and edges sorted by id / (from, to).
 */
export function topologyToGraphml(topology: BrainTopology): string {
  const nodes = [...topology.nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const edges = [...topology.edges].sort((a, b) => {
    if (a.from !== b.from) return a.from < b.from ? -1 : 1;
    return a.to < b.to ? -1 : a.to > b.to ? 1 : 0;
  });

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
    '  <graph id="G" edgedefault="directed">'
  ];

  for (const n of nodes) {
    lines.push(
      `    <node id="${escapeXml(n.id)}"><data key="label">${escapeXml(n.label)}</data></node>`
    );
  }
  let edgeId = 0;
  for (const e of edges) {
    lines.push(
      `    <edge id="e${edgeId}" source="${escapeXml(e.from)}" target="${escapeXml(e.to)}"/>`
    );
    edgeId++;
  }
  lines.push("  </graph>", "</graphml>");
  return lines.join("\n");
}

/**
 * Deterministic: same ordering.
 */
export function topologyToMermaid(topology: BrainTopology): string {
  const nodes = [...topology.nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const edges = [...topology.edges].sort((a, b) => {
    if (a.from !== b.from) return a.from < b.from ? -1 : 1;
    return a.to < b.to ? -1 : a.to > b.to ? 1 : 0;
  });

  const lines: string[] = ["graph LR"];
  for (const n of nodes) {
    const safe = n.id.replace(/[#\[\]()]/g, "_");
    lines.push(`  ${safe}["${n.label.replace(/"/g, '\\"')}"]`);
  }
  for (const e of edges) {
    const from = e.from.replace(/[#\[\]()]/g, "_");
    const to = e.to.replace(/[#\[\]()]/g, "_");
    lines.push(`  ${from} --> ${to}`);
  }
  return lines.join("\n");
}

/**
 * Deterministic: same ordering.
 */
export function topologyToDot(topology: BrainTopology): string {
  const nodes = [...topology.nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const edges = [...topology.edges].sort((a, b) => {
    if (a.from !== b.from) return a.from < b.from ? -1 : 1;
    return a.to < b.to ? -1 : a.to > b.to ? 1 : 0;
  });

  const lines: string[] = ["digraph topology {"];
  for (const n of nodes) {
    lines.push(`  ${escapeDot(n.id)} [label=${escapeDot(n.label)}];`);
  }
  for (const e of edges) {
    lines.push(`  ${escapeDot(e.from)} -> ${escapeDot(e.to)};`);
  }
  lines.push("}");
  return lines.join("\n");
}

export type ExportFormat = "graphml" | "mermaid" | "dot";

const FORMAT_SUFFIX: Record<ExportFormat, string> = {
  graphml: "topology.graphml",
  mermaid: "topology.mmd",
  dot: "topology.dot"
};

export function exportTopology(topology: BrainTopology, format: ExportFormat): string {
  switch (format) {
    case "graphml":
      return topologyToGraphml(topology);
    case "mermaid":
      return topologyToMermaid(topology);
    case "dot":
      return topologyToDot(topology);
    default:
      throw new Error(`Unknown format: ${format}`);
  }
}

export function getExportFilename(format: ExportFormat): string {
  return FORMAT_SUFFIX[format];
}
