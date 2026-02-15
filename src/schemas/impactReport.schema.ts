import { z } from "zod";

/**
 * storage/analysis/impact_<nodeId>.json (optional --save).
 */
export const ImpactReportSchema = z.object({
  schemaVersion: z.literal("1.0"),
  nodeId: z.string(),
  forwardCount: z.number().int().nonnegative(),
  backwardCount: z.number().int().nonnegative(),
  topNodes: z.array(
    z.object({
      nodeId: z.string(),
      forward: z.number().int().nonnegative(),
      backward: z.number().int().nonnegative(),
      total: z.number().int().nonnegative()
    })
  )
});

export type ImpactReport = z.infer<typeof ImpactReportSchema>;
