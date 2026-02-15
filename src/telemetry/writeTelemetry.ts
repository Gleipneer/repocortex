import path from "node:path";
import { writeJsonAtomic } from "../core/io.js";
import { validateOrThrow } from "../core/io.js";
import { TelemetrySchema } from "../schemas/telemetry.schema.js";

const LAST_RUN_FILE = "telemetry/last_run.json";

export async function writeLastRunTelemetry(
  outputDir: string,
  timings: { scanMs: number; graphMs: number; topologyMs: number; totalMs: number }
): Promise<void> {
  const outPath = path.join(outputDir, LAST_RUN_FILE);
  const payload = validateOrThrow(TelemetrySchema, {
    schemaVersion: "1.0",
    ...timings
  });
  await writeJsonAtomic(outPath, payload, outputDir);
}
