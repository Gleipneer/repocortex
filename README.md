# RepoCortex — Living System Intelligence Engine for Codebases

RepoCortex är ett deterministiskt, read-only "cortex" som kartlägger kodbaser och producerar en topologi + risk/gap-analys helt utan AI. AI används endast på explicit kommando och med budget-gating.

## ⚠ AICK Integration Role

RepoCortex is an internal structural sensor used by AICK (AI Change Kernel).

For governance workflows, use the AICK CLI as the primary entrypoint.
RepoCortex CLI remains a development/debug tool for sensor internals.

## Plan A (MVP)

- Scanner: filindex + hash + språk + storlek
- Graph: imports/exports + symbolindex (TS/JS)
- Runtime signals: spawn/exec/http server/fs writes/etc.
- Topology: brain_topology + flows + risk flags + centrality
- Gap detector: SCC cycles, dead code, un-gated exec paths, writes without ledger pattern, 0.0.0.0 bind without opt-in, missing tests, SimHash dupes
- Essence pack: max 12k chars, max 30 evidence pointers, max 200 nodes
- Minimal UI: lokal 2D "brain view"
- CLI: scan/map/gaps/essence/ui/audit (audit är OFF by default)

## Safety model (invariants)

- Ingen skrivning till target repo. Endast läsning.
- Ingen körning av target code.
- Inga nätverkslyssnare som standard. UI bindar 127.0.0.1.
- Alla outputs ligger i ./storage (eller explicit output dir).
- Varje körning loggas i ledger (runId, hashes, config).

## Budget model

- AI: default OFF.
- Cheap audit: essence pack only, strikt schema, max SEK 1–3.
- Expensive audit: explicit flag + budget-sek krävs.

## Quick start (dev)

1. Install

- npm i

2. Run tests

- npm test

3. Build

- npm run build

## CLI (development/debug)

- repocortex scan --repo /path/to/repo
- repocortex map --repo /path/to/repo
- repocortex gaps --repo /path/to/repo
- repocortex essence --repo /path/to/repo
- repocortex ui --from ./storage/topology/brain_topology.json
- repocortex audit --cheap --budget-sek 3

## Docs

- docs/ARCHITECTURE.md
- docs/CONTRACTS.md
- docs/DETERMINISM.md
