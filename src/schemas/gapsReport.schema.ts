import { z } from "zod";

export const GapItemSchema = z.object({
  id: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  title: z.string(),
  evidence: z.array(
    z.object({
      file: z.string(),
      line: z.number().int().positive().optional(),
      note: z.string()
    })
  )
});

export const GapsReportSchema = z.object({
  schemaVersion: z.literal("1.0"),
  summary: z.object({
    critical: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    low: z.number().int().nonnegative()
  }),
  gaps: z.array(GapItemSchema)
});

export type GapItem = z.infer<typeof GapItemSchema>;
export type GapsReport = z.infer<typeof GapsReportSchema>;
