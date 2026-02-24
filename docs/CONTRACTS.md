# RepoCortex Output Contracts (Plan A MVP)

All paths are relative to the storage root (`storage/` by default, or `REPOCORTEX_STORAGE`).

## Directory Layout

```
storage/
  snapshots/{snapshotId}/fileIndex.json
  facts/depGraph.json
  facts/symbolIndex.json
  facts/runtimeSignals.json
  topology/brain_topology.json
  topology/flows.json
  analysis/gaps_report.json
  analysis/gaps_report.md
  essence/pack.json
  essence/pack.md
  ledger/ledger.jsonl
  verification/last_verification.json
```

## Wrapper Rules (MVP Contract)

- **Only** `essence/pack.json` may be wrapped.
- All other JSON artifacts are **raw** schema objects (no global wrapper).
- Wrapper shape:

```json
{ "identity": { "schemaVersion": "1.0", "snapshotId": "...", "inputHash"?: "...", "artifactHash"?: "..." },
  "payload": { /* EssencePack */ } }
```

- Backward compatibility: `verify` accepts **raw** JSON everywhere; for `essence/pack.json` it accepts raw **or** wrapped and validates the payload.

## Artifact Schemas (v1.0)

- `snapshots/{snapshotId}/fileIndex.json`
  - `schemaVersion: "1.0"`
  - `repoRoot: string`, `generatedAtIso: string`
  - `files[]: { path, bytes, sha256, lang, isBinary, mtimeMs? }`
  - `totals: { fileCount, totalBytes }`
- `facts/depGraph.json`
  - `schemaVersion: "1.0"`, `nodes: string[]`, `edges[]: { from, to, kind, isExternal }`
- `facts/symbolIndex.json`
  - `schemaVersion: "1.0"`, `symbols[]: { name, file, kind, exported }`
- `facts/runtimeSignals.json`
  - `schemaVersion: "1.0"`, `signals[]: { file, line, kind, snippet }`
- `topology/brain_topology.json`
  - `schemaVersion: "1.0"`, `nodes[]`, `edges[]`, `metrics: { nodeCount, edgeCount }`
- `topology/flows.json`
  - `schemaVersion: "1.0"`, `flows[]: { id, path[], kind, riskFlags[] }`
- `analysis/gaps_report.json`
  - `schemaVersion: "1.0"`, `summary: { critical, high, medium, low }`, `gaps[]`
- `essence/pack.json`
  - `schemaVersion: "1.0"`, `constraints`, `overview`, `keyRisks[]`, `topologySummary`, `evidencePointers[]`
- `ledger/ledger.jsonl`
  - one JSON object per line: `schemaVersion, runId, atIso, command, repoRoot, inputHash, outputHash, artifacts[], notes[], advancedMetricsHash?`

## Verify Flow (Step-by-Step)

1. Load latest ledger entry from `ledger/ledger.jsonl`.
2. Recompute `outputHash` by hashing **artifact paths + file contents** for the ledger’s `artifacts[]` list.
3. Validate each JSON artifact against its schema:
   - If artifact is `essence/pack.json` and wrapped, validate `payload` as EssencePack.
   - All other artifacts are validated as raw JSON (no wrapper).
4. Write `verification/last_verification.json` with `{ schemaVersion: "1.0", verifiedAtIso, hashMatch, schemaValid }`.
5. CLI prints integrity + schema status; exit code is non‑zero if any check fails.

## Determinism Requirements

- Same repo content + same config + same clock ⇒ byte‑identical JSON artifacts.
- `snapshotId = inputHash.slice(0, 12)` where `inputHash` is a hash of the deterministic file index payload.
- `generatedAtIso` exists in `fileIndex.json` but **must not** affect `inputHash`.
- For fully byte‑identical runs, set `REPOCORTEX_CLOCK_ISO` so timestamps (`generatedAtIso`, ledger `atIso`) are stable.
- Ledger is the **only** place timestamps are allowed to vary when clock isn’t fixed.

## RELEASE_NOTES (Contract)

- Restored MVP contract: **no global wrapper**; only `essence/pack.json` may be wrapped.
- Verify accepts raw artifacts everywhere; `essence/pack.json` supports raw or wrapped payload.
