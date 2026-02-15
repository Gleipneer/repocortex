import { z } from "zod";

export const RuntimeSignalSchema = z.object({
  file: z.string(),
  line: z.number().int().positive(),
  kind: z.enum([
    "spawn",
    "exec",
    "httpServer",
    "httpsServer",
    "wsUpgrade",
    "setInterval",
    "setTimeout",
    "chokidarWatch",
    "fsWrite",
    "envMutation",
    "netListen",
    "bindAllInterfaces"
  ]),
  snippet: z.string()
});

export const RuntimeSignalsSchema = z.object({
  schemaVersion: z.literal("1.0"),
  signals: z.array(RuntimeSignalSchema)
});

export type RuntimeSignal = z.infer<typeof RuntimeSignalSchema>;
export type RuntimeSignals = z.infer<typeof RuntimeSignalsSchema>;
