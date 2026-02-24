import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "./hash.js";
import { writeJsonAtomic, validateOrThrow } from "./io.js";
import { ArtifactManifestSchema } from "../schemas/manifest.schema.js";

async function readToolVersion(): Promise<string> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = path.resolve(here, "../../package.json");
  const raw = await fs.readFile(pkgPath, "utf8");
  const parsed = JSON.parse(raw) as { version?: string };
  return parsed.version ?? "0.0.0";
}

export async function writeArtifactManifest(params: {
  outputDir: string;
  artifacts: string[];
  repoHash: string;
  snapshotId: string;
  runId: string;
  generatedAtIso: string;
}): Promise<string> {
  const outputDir = path.resolve(params.outputDir);
  const entries = [] as { pathRel: string; sha256: string }[];
  for (const rel of params.artifacts) {
    const full = path.join(outputDir, rel);
    const buf = await fs.readFile(full);
    entries.push({ pathRel: rel, sha256: sha256(buf) });
  }
  entries.sort((a, b) => a.pathRel.localeCompare(b.pathRel));

  const toolVersion = await readToolVersion();
  const manifest = validateOrThrow(ArtifactManifestSchema, {
    schemaVersion: "1.0",
    toolVersion,
    repoHash: params.repoHash,
    snapshotId: params.snapshotId,
    runId: params.runId,
    generatedAtIso: params.generatedAtIso,
    artifacts: entries
  });

  const outPath = path.join(outputDir, "system", "manifest.json");
  await writeJsonAtomic(outPath, manifest, outputDir);
  return outPath;
}
