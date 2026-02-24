import { z } from "zod";

export const ManifestEntrySchema = z.object({
  pathRel: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/)
});

export const ArtifactManifestSchema = z.object({
  schemaVersion: z.literal("1.0"),
  toolVersion: z.string(),
  repoHash: z.string().regex(/^[a-f0-9]{64}$/),
  snapshotId: z.string(),
  runId: z.string(),
  generatedAtIso: z.string(),
  artifacts: z.array(ManifestEntrySchema)
});

export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;
export type ArtifactManifest = z.infer<typeof ArtifactManifestSchema>;
