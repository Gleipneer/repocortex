# OpenClaw Truth Dump — Graph Ontology, Metrics, and Sanity Check

**Purpose:** Truth-first ontology and metric audit. No code changes; deterministic computations from artifacts.  
**Reproducibility:** Run `npm run truth-dump -- --out ./openclaw-analysis` (optionally `--write ./openclaw-analysis/truth-dump-results.json`). Script: `scripts/truthDump.ts`.

---

## A) GRAPH ONTOLOGY (DEFINITIONS)

### 1) Node definition

- **What a node represents:** One **file** (module) in the repo. Nodes are file paths (e.g. `src/index.ts`). Not symbols, not packages; one node per scanned TS/JS file.
- **Node kinds/types:** Schema allows `kind: "module" | "subsystem" | "entrypoint" | "sink" | "source" | "unknown"`. **As implemented today:** all nodes are set to `"module"` in `src/topology/buildTopology.ts` (no entrypoint/sink/source detection).
- **Count per kind:** Single kind in practice: all `module`. Count = `topology.metrics.nodeCount` (or `topology.nodes.length`).
- **Exact Node JSON shape** (from `src/schemas/topology.schema.ts`):

```json
{
  "id": "string",
  "label": "string",
  "kind": "module | subsystem | entrypoint | sink | source | unknown",
  "riskFlags": ["string"],
  "centrality": number
}
```

Required: `id`, `label`, `kind`, `riskFlags`, `centrality`. `centrality` in current code = (degree / maxDegree) over nodes, i.e. degree centrality normalized by max degree (`src/topology/buildTopology.ts` lines 44–61).

### 2) Edge definition

- **What an edge represents:** A **dependency** from one file to another: import/require/dynamicImport from the dep graph. Collapsed to a single edge type in topology: `kind: "imports"`. Runtime signals (writes, exec, net) are **not** extra edges; they appear as `riskFlags` on nodes and in `flows.json` only.
- **Directed:** Yes. Graph is directed: `from` → `to`.
- **Multiple edge types collapsed:** Dep graph has `kind: "import" | "require" | "dynamicImport"`. Topology maps all to `"imports"` and adds `riskFlags: ["external-dep"]` when `isExternal` (`src/topology/buildTopology.ts` lines 65–71).
- **Exact Edge JSON shape** (`src/schemas/topology.schema.ts`):

```json
{
  "from": "string",
  "to": "string",
  "kind": "calls | imports | writes | spawns | serves | unknown",
  "riskFlags": ["string"]
}
```

As implemented: `kind` is always `"imports"`; `riskFlags` is `["external-dep"]` for external specifiers, else `[]`.

### 3) What is included

- **External deps:** `node_modules` (and non-relative specifiers) are **not** nodes in the initial dep graph (nodes = file paths from file index). But edge targets can be **external specifiers** (e.g. `"lodash"`). In **advanced metrics** (`src/advanced/metrics.ts`), `buildGraph(topology)` builds `nodeSet` from **both** `topology.nodes` and all `e.from` / `e.to` in edges. So external specifiers that appear as `e.to` become nodes in the metric graph. Thus **n** (node count for metrics) can be **larger** than `topology.metrics.nodeCount`.
- **Runtime signals:** Injected as **risk flags on nodes** and as **flows** (one flow per risk type per node). Not as extra edges in the topology edge list.
- **Tests:** Test files are included as nodes if they are in the file index (TS/JS). No exclusion of test paths in topology build.

### 4) Entry points

- **Detection:** None. Schema has `entrypoint` kind but `buildTopology` never sets it; all nodes are `"module"`.
- **Where recorded:** Nowhere. No artifact lists entrypoints.

---

## B) METRICS DEFINITIONS (AS IMPLEMENTED TODAY)

### 1) Structural Density

- **Formula:** `structuralDensity = 1 - stabilityIndex`.
- **Where:** `src/health/healthReport.ts` line 53: `const structuralDensity = 1 - stabilityIndex;` (then rounded to 2 decimals). So it is **derived** from stabilityIndex read from `advanced/advanced_metrics.json`.

### 2) Stability Index

- **Formula:** `stabilityIndex = max(0, min(1, 1 - edgeDensity))` with `edgeDensity = m / (n * n)`. So `stabilityIndex = 1 - m/n²` (clamped 0–1). Here **n** and **m** are from `buildGraph(topology)` in metrics: **n** = number of distinct node ids (topology nodes ∪ all edge endpoints), **m** = `topology.edges.length`.
- **Where:** `src/advanced/metrics.ts` lines 151–156 (`computeStabilityIndex`), line 168 (`stabilityIndex = computeStabilityIndex(n, m)`).

### 3) Health Score

- **Formula:** `systemHealthScore = max(0, min(1, stabilityIndex * 0.7 + (1 - min(1, riskSum/10)) * 0.3))`, with `riskSum = (high * 0.4) + (medium * 0.2) + (low * 0.05)` from gaps summary.
- **Where:** `src/health/healthReport.ts` lines 54–56.

### 4) Gateway detection

- **Rule:** Top **5%** of nodes by **betweenness centrality** (min 1 node). Tie-break: betweenness descending, then node id ascending.
- **Where:** `src/advanced/metrics.ts` lines 137–146 (`computeGateways`), line 167.

### 5) Centrality

- **Degree:** In topology build, node `centrality` = `degree(node) / maxDegree` (degree = out-degree only in buildTopology; in metrics, degree is in+out for display). For **metrics** the script uses in-degree and out-degree from the directed graph.
- **PageRank:** 20 iterations, damping 0.85, uniform teleport; then **normalized so sum = 1**. Code: `src/advanced/metrics.ts` lines 46–75.
- **Betweenness:** Brandes algorithm on the **directed** graph; shortest paths follow out-edges only. `src/advanced/metrics.ts` lines 80–132.

---

## C) SANITY CHECK CALCULATIONS (FROM OPENCLAW RUN)

Use **n = 3605**, **m = 18049** as reported (Nodes=3605, Edges=18049). If your artifact counts differ, replace n and m (or run truth-dump and use its `nFromBuildGraph` / `mFromBuildGraph`).

**Command to generate all C) and D) from artifacts:**  
`npm run truth-dump -- --out ./openclaw-analysis`  
Optionally: `--write ./openclaw-analysis/truth-dump-results.json`

### 1) Density

- **density_directed** = m / (n×(n−1)) = 18049 / (3605×3604) ≈ **0.001 39**
- **density_undirected** = m / (n×(n−1)/2) ≈ **0.002 78**

### 2) Average degrees (directed)

- **avg_out_degree** = m/n ≈ **5.007**
- **avg_in_degree** = m/n ≈ **5.007**

### 3) Self-loops and multi-edges

- **Self-loops:** Not produced by the current pipeline (edges are imports; no self-import in dep graph). Count = 0 unless artifact has them; truth-dump script reports it.
- **Multi-edges:** Possible if the same (from, to) appears with different dep kinds; script counts pairs with multiplicity > 1.

### 4) Connected components (undirected)

- Treat graph as undirected; count components and size of largest. **Run truth-dump** for exact values (script: `connectedComponentsUndirected`).

### 5) SCC count and largest SCC (directed)

- **Run truth-dump** for exact values (script: Tarjan SCC).

### 6) Top 20 nodes by degree / PageRank / betweenness

- Each entry: `nodeId`, `label` (path), and value. **Run truth-dump**; see `top20ByDegree`, `top20ByPageRank`, `top20ByBetweenness` in the JSON output.

**Important:** Advanced metrics use **n = |nodeSet|** where nodeSet = topology.nodes ∪ {e.from, e.to for all edges}. So if many edges point to external specifiers, **n** can be much larger than 3605, and sanity checks above would use that **n** when computed from the same buildGraph. The script reports both `topology.metrics.nodeCount` and `nFromBuildGraph` so you can confirm.

---

## D) DISTRIBUTIONS (TRUTH-REVEALING)

Run: `npm run truth-dump -- --out ./openclaw-analysis`

Output includes:

1. **Degree distribution:** min / median / p95 / max for in-degree, out-degree, and total degree.
2. **Betweenness distribution:** min / median / p95 / max.
3. **PageRank distribution:** min / median / p95 / max.
4. **Edge-type distribution:** Currently one effective type (`imports`); script reports `edgeKindDistribution` (e.g. `{"imports": 18049}`). If schema edge kinds were ever mixed, counts per kind would appear here.

---

## E) RISK SURFACE EXPLANATION

### 1) How High/Medium/Low counts are computed

Gaps are produced by **rules** in `src/analysis/gapDetector.ts`:

| Rule id                 | Severity | Trigger                                                                    |
| ----------------------- | -------- | -------------------------------------------------------------------------- |
| `bind-all-interfaces`   | high     | Any signal `kind === "bindAllInterfaces"`                                  |
| `exec-without-policy`   | high     | Any signal `kind === "spawn"` or `"exec"`                                  |
| `writes-without-ledger` | medium   | Any signal `kind === "fsWrite"`                                            |
| `net-exposure`          | medium   | Any signal `kind` in `httpServer`, `httpsServer`, `netListen`, `wsUpgrade` |
| `cycle-<...>`           | medium   | Each SCC of size ≥ 2 from dep graph                                        |
| `modules-without-tests` | low      | No test folder or `*.test.ts` / `*.spec.ts` found                          |

Summary counts: `gaps_report.json` → `summary.high`, `summary.medium`, `summary.low` (and `critical`).

**OpenClaw run (1 High, 2 Medium):** To list the exact findings with file paths and evidence, open:

- `openclaw-analysis/analysis/gaps_report.json` → `gaps` array (each item: `id`, `severity`, `title`, `evidence[]` with `file`, `line`, `note`).
- `openclaw-analysis/analysis/gaps_report.md` for the same content in markdown.

If artifacts are not in repo: state "unknown (openclaw-analysis artifacts not present); run RepoCortex against OpenClaw and inspect the paths above."

### 2) Agreement between gaps_report.json and gaps_report.md

Both are produced in one pass in `src/analysis/gapDetector.ts`: same `report` is written to JSON and then rendered to MD (lines 164–179). They **agree** by construction.

---

## F) ARTIFACT CONSISTENCY

### 1) Topology and flows

- **brain_topology.json:** Confirm `metrics.nodeCount` and `metrics.edgeCount` match **computed** counts. The truth-dump script builds the graph the same way as `src/advanced/metrics.ts` and reports `topologyMetrics.nodeCountFromFile`, `edgeCountFromFile`, `nFromBuildGraph`, `mFromBuildGraph`, and `match` (true iff file counts equal buildGraph n and m). **Note:** If edges reference external `to`, `nFromBuildGraph` can exceed `nodeCountFromFile`.
- **flows.json:** Flows are **not** edges in the topology; they are one entry per (node, risk type) for nodes with net/write/exec risk flags. So flows count ≠ edge count; no delta to “explain” except that they represent different concepts.

### 2) Advanced metrics vs topology

- Advanced metrics are computed from the same topology file. Node ids in `advanced_metrics.json` (pageRank, betweenness, gateways) are the **buildGraph** node set (topology nodes ∪ edge endpoints). So they can include external specifiers that appear as edge targets. Same node set as in truth-dump’s n.

### 3) Verify and ledger outputHash

- Run: `repocortex verify --out ./openclaw-analysis` (or with `--config` pointing to that output). It loads the latest ledger line, recomputes the artifact hash from the artifact paths listed in the ledger, and compares with `ledger.outputHash`. Confirm that **verify** reports "Hash match: YES" so that the inputs to the hash exactly match the stored outputHash.

---

## G) ACTIONABLE CONCLUSIONS (NO CODE CHANGES YET)

### 1) Top 5 most likely root causes for StructuralDensity = 1

1. **n used in stabilityIndex is much smaller than 3605.** If `buildGraph` produced a very small n (e.g. only nodes that appear in both topology.nodes and as endpoints of edges that stay within that set, or a bug dropping nodes), then m/n² could be ≥ 1 → edgeDensity = 1 → stabilityIndex = 0 → structuralDensity = 1. With m = 18049, n would need to be ≤ √18049 ≈ 134.
2. **StabilityIndex read as 0 from advanced_metrics.** If `advanced_metrics.json` is missing or malformed, health defaults `stabilityIndex = 0` (see `src/health/healthReport.ts` catch block), so structuralDensity = 1 − 0 = 1.
3. **Wrong artifact or stale advanced_metrics.** OpenClaw output dir might point to a different/older run where n was small or metrics were not recomputed after topology change.
4. **Topology metrics mismatch.** If `topology.metrics` were written with wrong nodeCount/edgeCount (e.g. from a different code path), downstream metrics could still use buildGraph(n, m) correctly; but if something else reads `topology.metrics` for display and that was wrong, confusion could arise. Structural density itself is driven by advanced_metrics.stabilityIndex.
5. **Integer/float or rounding bug.** Unlikely given the formula, but any path that forces stabilityIndex to 0 (e.g. wrong clamp or division) would yield structuralDensity = 1.

### 2) Code/files to audit next

- **`src/advanced/metrics.ts`**
  - `buildGraph` (lines 13–41): how nodeSet is built; confirm it includes all topology.nodes and all e.from/e.to.
  - `computeStabilityIndex` (lines 151–156): confirm n, m and formula `1 - m/(n*n)` and clamp.
- **`src/health/healthReport.ts`**
  - Lines 23–31: how stabilityIndex is read from advanced_metrics; catch block sets it to 0 (and gatewayCount to 0).
  - Line 53: structuralDensity = 1 - stabilityIndex.
- **`src/advanced/runAdvancedMetrics.ts`**
  - Confirm it reads topology from the same output dir that pipeline wrote (e.g. same openclaw-analysis path) and that metrics are written after topology.
- **OpenClaw artifacts**
  - Inspect `openclaw-analysis/advanced/advanced_metrics.json` for `stabilityIndex` and `gateways.length`.
  - Inspect `openclaw-analysis/topology/brain_topology.json` for `metrics.nodeCount` and `metrics.edgeCount` and sample of `nodes`/`edges`.

### 3) Minimal reproduction plan

1. **Mini-repo:** Run full pipeline on `tests/fixtures/mini-repo` with a fixed clock; run `repocortex metrics` (or equivalent) to get advanced_metrics; run `repocortex health`. Check that structuralDensity is not 1 and that stabilityIndex matches 1 − m/n² from truth-dump on that output dir.
2. **Synthetic graph:** Add a small test that builds a BrainTopology with known n and m (e.g. n=10, m=50), runs `computeAdvancedMetrics(topology)` and `computeHealthSummary` (with that output dir containing the same topology and resulting advanced_metrics), and asserts stabilityIndex = 1 − 50/100 = 0.5 and structuralDensity = 0.5.
3. **OpenClaw:** Run `npm run truth-dump -- --out ./openclaw-analysis` and compare `nFromBuildGraph`, `mFromBuildGraph`, `computedMetrics.stabilityIndex`, `computedMetrics.structuralDensity` to the health report. If truth-dump’s computed stabilityIndex is ~0.999 and health reported 0.28 for Health and 1 for StructuralDensity, then the bug is in how health (or the OpenClaw run) gets stabilityIndex (e.g. wrong file or default 0).

---

## Command and script location

- **Command:** `npm run truth-dump -- --out ./openclaw-analysis`  
  Optional: `--write ./openclaw-analysis/truth-dump-results.json`
- **Script:** `scripts/truthDump.ts`  
  Reads topology, advanced_metrics, gaps, flows from the given output dir; computes C) and D) with stable ordering; prints JSON to stdout.

**Most suspicious metric formula:** **Structural density is defined as 1 − stabilityIndex.** For StructuralDensity to be 1, stabilityIndex must be 0. With the implemented formula (stabilityIndex = 1 − m/n²), that implies m/n² ≥ 1, i.e. n ≤ √m. For m = 18049, n would need to be ≤ 134. So either (1) the **n** used when computing advanced_metrics was much smaller than the reported 3605 nodes (e.g. different node set in buildGraph, or wrong topology), or (2) **stabilityIndex was not computed from this topology** (e.g. missing advanced_metrics and health defaulting to 0). The inconsistency is between “Nodes=3605, Edges=18049” and “StructuralDensity=1”; the formula itself is consistent with “structuralDensity = 1 when stabilityIndex = 0.”
