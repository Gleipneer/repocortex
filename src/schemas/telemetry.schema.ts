import { z } from "zod";

/**
 * storage/telemetry/last_run.json
 */
export const TelemetrySchema = z.object({
  schemaVersion: z.literal("1.0"),
  scanMs: z.number().nonnegative(),
  graphMs: z.number().nonnegative(),
  topologyMs: z.number().nonnegative(),
  totalMs: z.number().nonnegative()
});

export type Telemetry = z.infer<typeof TelemetrySchema>;
