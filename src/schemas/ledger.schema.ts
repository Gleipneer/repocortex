import { z } from "zod";

export const LedgerEntrySchema = z.object({
  schemaVersion: z.literal("1.0"),
  runId: z.string(),
  atIso: z.string(),
  command: z.string(),
  repoRoot: z.string(),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  outputHash: z.string().regex(/^[a-f0-9]{64}$/),
  artifacts: z.array(z.string()),
  notes: z.array(z.string()).default([]),
  /** sha256(advanced_metrics.json); optional so old ledger entries still validate */
  advancedMetricsHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional()
});

export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;
