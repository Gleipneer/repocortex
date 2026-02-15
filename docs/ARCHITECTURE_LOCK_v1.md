# Architecture Lock v1 — Plan A MVP

Frozen architecture and contract snapshot for RepoCortex Plan A MVP. All artifacts and CLI behavior are defined by this lock until a future major version.

---

## 1. System Flow

```
[Target repo (read-only)]
         │
         ▼
  ┌──────────────┐
  │ scanRepo     │  → snapshots/{snapshotId}/fileIndex.json
  │ (scanner)    │     inputHash, snapshotId
  └──────────────┘
         │
         ▼
  ┌──────────────┐
  │ detectRuntimeSignals │  → facts/runtimeSignals.json
  │ buildDepGraph        │  → facts/depGraph.json, facts/symbolIndex.json
  └──────────────┘
         │
         ▼
  ┌──────────────┐
  │ buildTopology│  → topology/brain_topology.json, topology/flows.json
  └──────────────┘
         │
         ▼
  ┌──────────────┐
  │ detectGaps   │  → analysis/gaps_report.json, analysis/gaps_report.md
  └──────────────┘
         │
         ▼
  ┌──────────────┐
  │ generateEssence │  → essence/pack.json, essence/pack.md
  └──────────────┘
         │
         ▼
  ┌──────────────┐
  │ appendLedger │  → ledger/ledger.jsonl (one line per run)
  └──────────────┘
```

- **Entry points:** CLI (`dist/cli/main.js`) commands: `status`, `init`, `run`, `inspect`, `scan`, `map`, `gaps`, `essence`, `pipeline`, `audit`, and Structural Maturity Layer commands (see §7).
- **Single pipeline:** `runFullPipeline(cfg)` in `src/core/pipeline.ts` runs all steps and appends one ledger entry.
- **Clock:** Optional `clockIso` (or `REPOCORTEX_CLOCK_ISO`) for deterministic runId and fileIndex `generatedAtIso`.

---

## 1b. User Interaction Layer (Config + Commands)

- **Mode C:** Flags-first; prompt fallback when a value is missing and not `--non-interactive`.
- **Config file:** `repocortex.config.json` (default in cwd; or `--config <path>`). Schema version 1.0; fields: `repoRoot`, `outputDir`, `maxFiles`, `maxBytes`, optional `defaultAuditBudgetSek`, optional `clockIso`, `printPaths` (default true). Paths in config are resolved relative to **cwd**.
- **Merge priority:** CLI > ENV (`REPOCORTEX_STORAGE`, `REPOCORTEX_CLOCK_ISO`) > CONFIG > DEFAULTS.
- **init:** Creates config (flags-first; prompt fallback). Options: `--repo`, `--out`, `--max-files`, `--max-bytes`, `--clock-iso`, `--config`, `--force`, `--non-interactive`. Does not overwrite existing config unless `--force`. Uses atomic write. Validates `repoRoot` exists. No pipeline run.
- **run:** Requires config file or explicit `--repo`. Loads config (or uses defaults when `--repo` only), merges overrides, runs pipeline. **Always** prints Run Summary; prints artifact paths when `printPaths` is true (`--print-paths` / `--no-print-paths`). If config missing and no `--repo`, exits with error suggesting `repocortex init`.
- **inspect:** Reads **last ledger line** from `{outputDir}/ledger/ledger.jsonl`; prints runId, atIso, command, repoRoot, snapshotId, outputHash, artifacts, **paths** (artifact paths), and optionally **counts** (nodes, edges, gaps high/medium/low). Output dir from config or `--out`. No new analysis.
- **Safety:** All writes remain under `outputDir`; no writes to `repoRoot`. Core engine (Plan A) unchanged; only the user interaction layer sits on top.

---

## 2. Contracts

- **Storage root:** `storage/` or `REPOCORTEX_STORAGE` or `--out`. All writes under this root.
- **Directory layout:**  
  `snapshots/{snapshotId}/fileIndex.json`  
  `facts/depGraph.json`, `facts/symbolIndex.json`, `facts/runtimeSignals.json`  
  `topology/brain_topology.json`, `topology/flows.json`  
  `analysis/gaps_report.json`, `analysis/gaps_report.md`  
  `essence/pack.json`, `essence/pack.md`  
  `ledger/ledger.jsonl`
- **Schema version:** All JSON artifacts carry `schemaVersion: "1.0"`. Only 1.0 is supported; unknown version must throw.
- **Ledger line:** One JSON object per line: `runId`, `atIso`, `command`, `repoRoot`, `inputHash`, `outputHash`, `artifacts[]`, `notes[]`.
- **Repocortex config:** `repocortex.config.json`: `schemaVersion: "1.0"`, `repoRoot`, `outputDir`, `maxFiles`, `maxBytes`, optional `defaultAuditBudgetSek`, optional `clockIso`, `printPaths` (default true). Validated with Zod; version-locked.
- **Hashing:** `inputHash` = hash of deterministic file-index payload; `outputHash` = hash of artifact path+content (artifactHash) or stableStringify concatenation (ledger module); `runId` = hash(inputHash + startIso).slice(0,12).

---

## 3. Invariants

- **Determinism:** Same repo content + same config + same clock ⇒ same artifact content and same content hashes. Timestamps only in ledger/metadata.
- **Read-only on target:** No writes to `repoRoot`; no execution of target code.
- **Single output root:** All writes under one resolved `outputDir`; `writeJsonAtomic` enforces path under outputDir.
- **Schema gate:** Every written artifact is validated with Zod; `schemaVersion` 1.0 enforced.

---

## 4. Security Model

- **No escape:** All write paths are derived from `outputDir` or from `getStoragePaths(outputDir, snapshotId)`. `assertUnderOutputDir` in `writeJsonAtomic` blocks path escape.
- **No execution:** Scanner and analysis do not spawn or execute code from the target repo.
- **Guards:** Scanner limits `maxFiles` (default 50k) and `maxBytes` (default 2GB); over limit requires `--force`.
- **Audit stub:** No external API or LLM call; budget option validated (positive number, max 5 SEK in MVP).

---

## 5. Budget Model

- **Audit (MVP):** `--budget-sek <n>` required for `audit --cheap`; must be positive; cap 5 SEK (guardrail). No actual spend or API call.
- **Future (Plan B/C):** LLM/budget gating and real spend tracking are out of scope for this lock.

---

## 6. What Is NOT Implemented (Plan B / Plan C)

- **UI:** No local server, no 127.0.0.1 UI.
- **Audit (real):** No LLM integration, no API calls, no real budget consumption.
- **Incremental / sparse scan:** Full scan every run; no diff or cache.
- **Multi-version schema:** No compatibility for schemaVersion other than 1.0.
- **Concurrency:** Single-threaded pipeline; no worker pool or parallel scan.
- **Caching:** No cross-run cache of hashes or graph.
- **Notifications / webhooks:** None.
- **Auth / multi-tenant:** Single storage root; no access control.

---

## 7. Structural Maturity Layer (Additive)

Additive commands and artifacts for intelligence and robustness. **No changes to Plan A artifact list, schemas, or outputHash.** All deterministic; no network; no hidden execution.

- **verify:** Load latest ledger entry, recompute artifact hash from files, validate JSON schemas. Writes `storage/verification/last_verification.json`. Prints Integrity/Schemas/Hash match; exit 1 on mismatch.
- **snapshot-contracts:** Hash schema files, CLI source, RepoCortex version, Node version, timestamp. Writes `storage/contracts/contracts_snapshot.json`. For future drift detection.
- **export:** `--format graphml|mermaid|dot`. Writes `storage/exports/topology.graphml`, `topology.mmd`, `topology.dot`. Deterministic ordering; pure string generation; no external libs.
- **impact:** `--node <id>` (optional `--save`). Forward/backward reach from topology; prints counts and top 10 nodes. If `--save`, writes `storage/analysis/impact_<nodeId>.json`.
- **duplicates:** 64-bit simhash, Hamming ≤ 3. Writes `storage/analysis/duplicates.json`. Not integrated into gaps.
- **health:** Reads advanced_metrics, gaps, stabilityIndex, duplicates. Prints System Health Score, Gateway Nodes, Duplicate Pairs, Structural Density. No writes.
- **diff:** `--snapshot <id1> --snapshot <id2>`. Added/removed nodes (from file indexes), edge/risk delta. Writes `storage/diff/diff_<id1>_<id2>.json`. Deterministic.

**Telemetry:** Pipeline records scan/graph/topology/total timing and writes `storage/telemetry/last_run.json`. Does not affect artifact list or outputHash.

**Deterministic sorting:** `deepSortObject()` used before stable stringify so two runs can produce byte-identical JSON where applicable.
