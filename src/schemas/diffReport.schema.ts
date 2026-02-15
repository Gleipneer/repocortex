import { z } from "zod";

/**
 * storage/diff/diff_<id1>_<id2>.json
 */
export const DiffReportSchema = z.object({
  schemaVersion: z.literal("1.0"),
  snapshotId1: z.string(),
  snapshotId2: z.string(),
  addedNodes: z.array(z.string()),
  removedNodes: z.array(z.string()),
  edgeDelta: z.number().int(),
  riskDelta: z.number().int()
});

export type DiffReport = z.infer<typeof DiffReportSchema>;
