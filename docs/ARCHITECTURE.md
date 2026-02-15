# RepoCortex Architecture

## Overview

RepoCortex is a **read-only**, **deterministic** pipeline that analyzes a codebase and produces structured artifacts under `storage/`. No code from the target repo is executed; no writes are made to the target repo.

## Pipeline (Plan A)

```
[Target repo (read-only)]
         │
         ▼
  ┌──────────────┐
  │ File scanner │  → file index + content hash
  └──────────────┘
         │
         ▼
  ┌──────────────┐
  │ Dep graph    │  → facts/depGraph.json, symbolIndex, runtimeSignals
  └──────────────┘
         │
         ▼
  ┌──────────────┐
  │ Topology     │  → brain_topology.json, flows.json
  └──────────────┘
         │
         ▼
  ┌──────────────┐
  │ Analysis     │  → gaps_report.json / .md
  └──────────────┘
         │
         ▼
  ┌──────────────┐
  │ Essence pack │  → pack.json, pack.md (LLM input if budget-gated)
  └──────────────┘
         │
         ▼
  ┌──────────────┐
  │ Ledger       │  → one JSONL entry per run (runId, hashes, timestamp)
  └──────────────┘
```

## Components

- **Schemas**: TypeScript types for run metadata, file index, dep graph, ledger (see `src/schemas/`).
- **Utils**: Deterministic hashing, storage paths, ledger append, runId (see `src/utils/`).
- **Scanner** (to implement): Walks repo files, builds file index with hashes; no exec.
- **Graph** (to implement): Parses imports/requires, builds dep graph and symbol index.
- **Topology** (to implement): Derives brain_topology and flows from graph.
- **Analysis** (to implement): Gaps report from topology + facts.
- **Essence** (to implement): Pack schema and generator; input for optional LLM.
- **CLI** (to implement): Entry point, config, output dir, runId/timestamp/ledger.
- **UI** (to implement): Minimal local server (127.0.0.1), reads from storage only.

## Invariants

- **Determinism gate**: Same input (file set + content) + same config ⇒ same artifact hashes; timestamps live only in ledger/metadata.
- **No side effects on target**: Read-only FS access; no spawn/exec of target repo.
- **Single output root**: All outputs under one storage root; each run identified by runId and recorded in ledger.

## Implementation order

1. Scaffold + schemas + core utils + baseline tests ✅
2. Scanner + file index + tests
3. Dep graph + symbol index + runtime signals + tests
4. Topology + tests
5. Analysis (gaps) + tests
6. Essence pack + tests
7. CLI + tests
8. UI + tests
9. Audit (budget-gated LLM) last

Small commits; each step delivered with tests and fixtures.
