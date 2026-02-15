import { ConfigSchema, type RepoCortexConfig } from "./config.schema.js";

export { ConfigSchema };
export type { RepoCortexConfig };

/** @deprecated Use ConfigSchema from ./config.schema.js */
export const RepocortexConfigSchema = ConfigSchema;

/** @deprecated Use RepoCortexConfig from ./config.schema.js */
export type RepocortexConfig = RepoCortexConfig;

/** Merged runtime config: CLI > ENV > CONFIG > DEFAULTS */
export interface MergedConfig {
  repoRoot: string;
  outputDir: string;
  maxFiles: number;
  maxBytes: number;
  clockIso: string | undefined;
  printPaths: boolean;
}
