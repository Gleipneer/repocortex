import { z } from "zod";

export const DepEdgeSchema = z.object({
  from: z.string(), // module path
  to: z.string(), // resolved or raw specifier
  kind: z.enum(["import", "require", "dynamicImport"]),
  isExternal: z.boolean()
});

export const DepGraphSchema = z.object({
  schemaVersion: z.literal("1.0"),
  nodes: z.array(z.string()),
  edges: z.array(DepEdgeSchema)
});

export type DepEdge = z.infer<typeof DepEdgeSchema>;
export type DepGraph = z.infer<typeof DepGraphSchema>;
