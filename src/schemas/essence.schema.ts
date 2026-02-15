import { z } from "zod";

export const EssencePackSchema = z.object({
  schemaVersion: z.literal("1.0"),
  constraints: z.object({
    maxChars: z.number().int().positive(),
    maxEvidencePointers: z.number().int().positive(),
    maxNodes: z.number().int().positive()
  }),
  overview: z.string(),
  keyRisks: z.array(z.string()),
  topologySummary: z.object({
    nodeCount: z.number().int().nonnegative(),
    edgeCount: z.number().int().nonnegative(),
    topCentralNodes: z.array(z.string())
  }),
  evidencePointers: z.array(
    z.object({
      path: z.string(),
      note: z.string()
    })
  )
});

export type EssencePack = z.infer<typeof EssencePackSchema>;
