# RepoCortex Output Contracts

All paths are relative to the **storage root** (`storage/` by default, or `REPOCORTEX_STORAGE`).

## Directory layout

```
storage/
  snapshots/
    {snapshotId}/
      fileIndex.json
  facts/
    depGraph.json
    symbolIndex.json
    runtimeSignals.json
  topology/
    brain_topology.json
    flows.json
  analysis/
    gaps_report.json
    gaps_report.md
  essence/
    pack.json
    pack.md
  ledger/
    ledger.jsonl
```

### `repocortex.config.json` (project root)

- Required for `repocortex run` without explicit flags. Created by `repocortex init`.
- Schema version 1.0; validated with Zod. Overridable by CLI flags.

Example:

```json
{
  "schemaVersion": "1.0",
  "repoRoot": "",
  "outputDir": "./storage",
  "maxFiles": 50000,
  "maxBytes": 2000000000,
  "defaultAuditBudgetSek": 3
}
```

## Artifact contracts

### `snapshots/{snapshotId}/fileIndex.json`

- **Schema**: `{ runId: string, entries: Array<{ path: string, hash: string }> }`
- One entry per file; `hash` is deterministic content hash (e.g. SHA-256 hex).

### `facts/depGraph.json`

- **Schema**: `{ runId: string, nodes: DepGraphNode[], edges: DepGraphEdge[] }`
- Nodes: `{ id: string, path?: string }`; edges: `{ from: string, to: string }`.

### `facts/symbolIndex.json`

- Symbol-to-location index (exact schema TBD in scanner/graph step).

### `facts/runtimeSignals.json`

- Static runtime hints (exact schema TBD).

### `topology/brain_topology.json`

- High-level topology (TBD).

### `topology/flows.json`

- Flow definitions (TBD).

### `analysis/gaps_report.json`

- Machine-readable gaps (TBD).

### `analysis/gaps_report.md`

- Human-readable gaps report.

### `essence/pack.json`

- Strict schema for LLM input; budget-gated.

### `essence/pack.md`

- Human-readable essence summary.

### `ledger/ledger.jsonl`

- One JSON object per line. Each line: `{ runId, timestamp, inputHash, outputHash, configHash?, snapshotId? }`.
- Timestamps are **only** here (and in run metadata) so that deterministic outputs do not depend on time.

## Determinism

- Same input (file set + content) + same config ⇒ same `fileIndex`, `depGraph`, and other content-based artifacts.
- Only `runId`, `timestamp`, and ledger entries may differ between runs; they are isolated in metadata/ledger.
