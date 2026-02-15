import { z } from "zod";

export const SymbolSchema = z.object({
  name: z.string(),
  file: z.string(), // repo-relative
  kind: z.enum(["export", "import", "function", "class", "const", "type", "interface", "unknown"]),
  exported: z.boolean()
});

export const SymbolIndexSchema = z.object({
  schemaVersion: z.literal("1.0"),
  symbols: z.array(SymbolSchema)
});

export type Symbol = z.infer<typeof SymbolSchema>;
export type SymbolIndex = z.infer<typeof SymbolIndexSchema>;
