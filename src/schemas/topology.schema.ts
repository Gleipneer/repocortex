import { z } from "zod";

export const TopologyNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(["module", "subsystem", "entrypoint", "sink", "source", "unknown"]),
  riskFlags: z.array(z.string()),
  centrality: z.number().nonnegative()
});

export const TopologyEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  kind: z.enum(["calls", "imports", "writes", "spawns", "serves", "unknown"]),
  riskFlags: z.array(z.string())
});

export const BrainTopologySchema = z.object({
  schemaVersion: z.literal("1.0"),
  nodes: z.array(TopologyNodeSchema),
  edges: z.array(TopologyEdgeSchema),
  metrics: z.object({
    nodeCount: z.number().int().nonnegative(),
    edgeCount: z.number().int().nonnegative()
  })
});

export type TopologyNode = z.infer<typeof TopologyNodeSchema>;
export type TopologyEdge = z.infer<typeof TopologyEdgeSchema>;
export type BrainTopology = z.infer<typeof BrainTopologySchema>;

export const FlowsSchema = z.object({
  schemaVersion: z.literal("1.0"),
  flows: z.array(
    z.object({
      id: z.string(),
      path: z.array(z.string()), // node ids
      kind: z.enum(["exec", "write", "net", "mixed", "unknown"]),
      riskFlags: z.array(z.string())
    })
  )
});

export type Flows = z.infer<typeof FlowsSchema>;
