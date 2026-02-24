import fs from "node:fs/promises";
import path from "node:path";
import { parseBrainTopology } from "../core/validate.js";
import { readJson } from "../core/io.js";
import { ensureDir, writeFileAtomic } from "../core/io.js";

const EXPORTS_DIR = "exports";
const TOPOLOGY_PATH = "topology/brain_topology.json";

/**
 * Read topology from outputDir and export to format. Write to outputDir/exports/.
 */
export async function runExport(
  outputDir: string,
  format: "graphml" | "mermaid" | "dot"
): Promise<string> {
  const topologyPath = path.join(outputDir, TOPOLOGY_PATH);
  const raw = await readJson(topologyPath);
  const topology = parseBrainTopology(raw);

  const { exportTopology, getExportFilename } = await import("./topologyExport.js");
  const content = exportTopology(topology, format);
  const filename = getExportFilename(format);
  const outDir = path.join(outputDir, EXPORTS_DIR);
  await ensureDir(outDir);
  const outPath = path.join(outDir, filename);

  if (format === "graphml" || format === "mermaid" || format === "dot") {
    await writeFileAtomic(outPath, content);
  }
  return outPath;
}
