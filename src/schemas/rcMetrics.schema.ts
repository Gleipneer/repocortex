import { z } from "zod";

export const RCMetricsSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    healthScore: z.number(),
    nodeCount: z.number(),
    edgeCount: z.number(),
    duplicatePairs: z.number(),
    gatewayNodes: z.number(),
    structuralDensity: z.number()
  })
  .strict();

export type RCMetrics = z.infer<typeof RCMetricsSchema>;
