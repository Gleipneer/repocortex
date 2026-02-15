import { z } from "zod";

/**
 * storage/analysis/duplicates.json
 */
export const DuplicatesReportSchema = z.object({
  schemaVersion: z.literal("1.0"),
  pairs: z.array(
    z.object({
      pathA: z.string(),
      pathB: z.string(),
      simhashA: z.string(),
      simhashB: z.string(),
      hamming: z.number().int().nonnegative()
    })
  )
});

export type DuplicatesReport = z.infer<typeof DuplicatesReportSchema>;
