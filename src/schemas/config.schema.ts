import { z } from "zod";

export const ConfigSchema = z.object({
  schemaVersion: z.literal("1.0"),
  repoRoot: z.string().min(1),
  outputDir: z.string().min(1).default("./storage"),
  maxFiles: z.number().int().positive().default(50000),
  maxBytes: z.number().int().positive().default(2_000_000_000),
  clockIso: z.string().optional(),
  printPaths: z.boolean().default(true),
  defaultAuditBudgetSek: z.number().int().nonnegative().optional()
});

export type RepoCortexConfig = z.infer<typeof ConfigSchema>;
