import { z } from "zod";

/**
 * storage/contracts/contracts_snapshot.json
 * Additive only; for drift detection.
 */
export const ContractsSnapshotSchema = z.object({
  schemaVersion: z.literal("1.0"),
  repocortexVersion: z.string(),
  nodeVersion: z.string(),
  timestamp: z.string(),
  schemaHashes: z.record(z.string(), z.string()),
  cliSourceHash: z.string()
});

export type ContractsSnapshot = z.infer<typeof ContractsSnapshotSchema>;
