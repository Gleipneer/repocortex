# RepoCortex System Specification (v1.0)

Spec-Version: 1.0
Source-of-Truth: `src/`

## 1) System Purpose
Deterministic, read-only codebase intelligence engine that produces structured artifacts from a source repository and records immutable hashes for verification.

## 2) Core Components

Component | Purpose | Primary Inputs | Primary Outputs | Source
---|---|---|---|---
Pipeline | Full analysis pipeline, generates core artifacts and ledger entry | repoRoot, outputDir, clockIso, guards | artifacts, manifest, ledger entry | `src/core/pipeline.ts`
Artifact Registry | Single source of truth for artifact lists per mode | outputDir, paths | artifact path lists | `src/core/artifactRegistry.ts`
Manifest | Per-run artifact hash list | artifacts, repoHash, snapshotId, runId, generatedAtIso | `system/manifest.json` | `src/core/manifest.ts`
Verify | Recompute output hash, validate schemas | outputDir, ledger entry | `verification/last_verification.json` | `src/verification/runVerify.ts`
Self | Run pipeline on cwd with deterministic clock | cwd repoRoot, outputDir, clockIso | full pipeline outputs | `src/cli/main.ts`
Essence | Generate high-level summary pack | topology, gaps, constraints | `essence/pack.json`, `essence/pack.md` | `src/essence/generateEssence.ts`, `src/analysis/essence.ts`
Snapshot | One-shot bundle with repo manifest + artifact snapshot | repoRoot, outDir | `snapshot.json`, `snapshot_previous.json` | `src/cli/commands/snapshot.ts`
Ledger | Append-only run log with hashes | run metadata | `ledger/ledger.jsonl` | `src/core/ledger.ts`

## 3) Determinism Rules

Rule | Enforcement | Source
---|---|---
Stable JSON output | `stableStringify` sorts keys recursively | `src/core/stableJson.ts`
Atomic writes | `writeJsonAtomic` and `writeFileAtomic` | `src/core/io.ts`
Deterministic clock for self | `self` requires `--clock-iso` or `REPOCORTEX_CLOCK_ISO` | `src/cli/main.ts`
Sorted artifact lists | Registry and manifest entries sorted | `src/core/artifactRegistry.ts`, `src/core/manifest.ts`
Schema-validated outputs | All JSON artifacts validated by Zod schemas | `src/schemas/*.schema.ts`

## 4) Artifact Types (Exact Formats)

Artifact | Path (relative to outputDir) | Schema | Producer
---|---|---|---
File Index | `snapshots/<snapshotId>/fileIndex.json` | `FileIndexSchema` | `src/scanner/scan.ts`
Dep Graph | `facts/depGraph.json` | `DepGraphSchema` | `src/analysis/depGraph.ts`
Symbol Index | `facts/symbolIndex.json` | `SymbolIndexSchema` | `src/analysis/depGraph.ts`
Runtime Signals | `facts/runtimeSignals.json` | `RuntimeSignalsSchema` | `src/analysis/runtimeSignals.ts`
Brain Topology | `topology/brain_topology.json` | `BrainTopologySchema` | `src/topology/buildTopology.ts`
Flows | `topology/flows.json` | `FlowsSchema` | `src/topology/buildTopology.ts`
Gaps Report (JSON) | `analysis/gaps_report.json` | `GapsReportSchema` | `src/analysis/gapDetector.ts`
Gaps Report (MD) | `analysis/gaps_report.md` | Markdown | `src/analysis/gapDetector.ts`
Essence Pack (JSON) | `essence/pack.json` | `EssencePackSchema` or wrapped variant | `src/essence/generateEssence.ts` + wrap in `src/core/pipeline.ts`
Essence Pack (MD) | `essence/pack.md` | Markdown | `src/essence/generateEssence.ts`
Advanced Metrics | `advanced/advanced_metrics.json` | `AdvancedMetricsSchema` | `src/advanced/runAdvancedMetrics.ts`
Verification | `verification/last_verification.json` | `LastVerificationSchema` | `src/verification/runVerify.ts`
Contracts Snapshot | `contracts/contracts_snapshot.json` | `ContractsSnapshotSchema` | `src/contracts/snapshotContracts.ts`
Diff Report | `diff/diff_<id1>_<id2>.json` | `DiffReportSchema` | `src/diff/runDiff.ts`
Duplicates Report | `analysis/duplicates.json` | `DuplicatesReportSchema` | `src/analysis/duplicateDetector.ts`
Impact Report | `analysis/impact_<nodeId>.json` | `ImpactReportSchema` | `src/cli/main.ts` (impact --save)
Telemetry | `telemetry/last_run.json` | `TelemetrySchema` | `src/telemetry/writeTelemetry.ts`
Manifest | `system/manifest.json` | `ArtifactManifestSchema` | `src/core/manifest.ts`
Ledger | `ledger/ledger.jsonl` | `LedgerEntrySchema` (per line) | `src/core/ledger.ts`
Exports | `exports/<format>.{graphml,mermaid,dot}` | Text | `src/export/runExport.ts`
Snapshot Bundle | `snapshot.json`, `snapshot_previous.json` | Snapshot internal structure (see `src/cli/commands/snapshot.ts`) | `src/cli/commands/snapshot.ts`

### Essence Pack Wrapping
`essence/pack.json` is wrapped in pipeline runs:

Format: `{ identity: { schemaVersion, snapshotId, inputHash? , artifactHash? }, payload: EssencePack }`

Source: `src/core/pipeline.ts`, `src/schemas/wrappedArtifact.schema.ts`

## 5) Hash Calculation

Hash | Definition | Source
---|---|---
`outputHash` | `sha256` over concatenation of absolute path + file contents for each artifact, sorted by path | `src/core/artifactHash.ts`
`manifest.artifacts[].sha256` | `sha256(file_contents)` per artifact | `src/core/manifest.ts`
`advancedMetricsHash` | `sha256(stableStringify(metrics))` | `src/advanced/runAdvancedMetrics.ts`
`ledger` entry line | `stableStringify(entry)` per line | `src/core/ledger.ts`

## 6) Manifest Structure

Schema: `ArtifactManifestSchema` (`src/schemas/manifest.schema.ts`)

Field | Type | Notes
---|---|---
schemaVersion | `"1.0"` | fixed literal
toolVersion | `string` | from `package.json`
repoHash | `sha256 hex` | inputHash from scan
snapshotId | `string` | scan snapshot id
runId | `string` | derived from inputHash + clock
generatedAtIso | `string` | from clock
artifacts | `[{ pathRel, sha256 }]` | sorted by `pathRel`

## 7) Output Invariants

Invariant | Description | Source
---|---|---
Artifacts under outputDir | All JSON writes validated and written under outputDir | `src/core/io.ts`
Atomic JSON writes | Write to `.tmp` then rename | `src/core/io.ts`
Deterministic JSON | `stableStringify` for all JSON artifacts | `src/core/io.ts`
Manifest includes artifact list | `system/manifest.json` always includes core pipeline artifacts | `src/core/pipeline.ts`
Ledger append-only | JSONL, one entry per command run | `src/core/ledger.ts`

## 8) Failure Modes

Failure | Trigger | Behavior | Source
---|---|---|---
Missing config | `run`, `verify`, `inspect`, etc. with no config and no `--out` | Error | `src/cli/main.ts`
Repo missing | invalid `--repo` | Error | `src/cli/main.ts`
Scan guards exceeded | repo over `maxFiles`/`maxBytes` without `--force` | Error | `src/scanner/scan.ts`
Deterministic clock required | `self` without `--clock-iso`/env | Error | `src/cli/main.ts`
Verify mismatch | recomputed hash or schema fail | exits non-zero | `src/verification/runVerify.ts`, `src/cli/main.ts`

## 9) CLI Entrypoints

Command | Purpose | Key Options | Outputs
---|---|---|---
status | basic health | none | stdout
init | create config | `--repo`, `--out`, `--max-files`, `--max-bytes`, `--clock-iso`, `--config`, `--force`, `--non-interactive` | `repocortex.config.json`
run | full pipeline from config or repo | `--config`, `--repo`, `--out`, `--max-files`, `--max-bytes`, `--clock-iso`, `--print-paths` | pipeline artifacts + ledger + manifest
inspect | summarize latest ledger entry | `--config`, `--out` | stdout
metrics | compute advanced metrics | `--config`, `--out` | `advanced/advanced_metrics.json`, ledger entry
verify | recompute hash + schema validate | `--config`, `--out` | `verification/last_verification.json`
snapshot-contracts | snapshot contracts (schema hashes + CLI hash) | `--config`, `--out` | `contracts/contracts_snapshot.json`
export | export topology | `--format`, `--config`, `--out` | `exports/*`
impact | reachability from node | `--node`, `--save`, `--config`, `--out` | optional `analysis/impact_<nodeId>.json`
duplicates | detect near-duplicates | `--config`, `--out` | `analysis/duplicates.json`
health | compute health summary | `--config`, `--out` | stdout
diff | compare snapshots | `--snapshot` x2, `--config`, `--out` | `diff/diff_<id1>_<id2>.json`
scan | scan repo | `--repo`, `--out`, `--force`, `--max-files`, `--max-bytes` | `snapshots/<id>/fileIndex.json`, ledger entry
map | scan + topology | `--repo`, `--out`, `--force`, `--max-files`, `--max-bytes` | scan + facts + topology, ledger entry
gaps | detect gaps | `--repo`, `--out`, `--force`, `--max-files`, `--max-bytes` | gaps artifacts, ledger entry
essence | generate essence | `--repo`, `--out`, `--force`, `--max-files`, `--max-bytes`, `--essence-max-evidence`, `--essence-max-nodes` | essence artifacts, ledger entry
self | pipeline on cwd | `--out`, `--force`, `--max-files`, `--max-bytes`, `--clock-iso`, `--essence-max-*` | pipeline artifacts + ledger + manifest
pipeline | pipeline on explicit repo | `--repo`, `--out`, `--force`, `--max-files`, `--max-bytes`, `--essence-max-*` | pipeline artifacts + ledger + manifest
audit | stub | `--cheap`, `--budget-sek`, `--out` | stdout

## 10) Environment Contracts

Variable | Purpose | Used By
---|---|---
`REPOCORTEX_STORAGE` | override default outputDir | `src/utils/paths.ts`, CLI
`REPOCORTEX_CLOCK_ISO` | deterministic clock injection | CLI run/verify/self/metrics/snapshot-contracts

## 11) Schema Field Reference

### FileIndexSchema (`src/schemas/fileIndex.schema.ts`)

Field | Type
---|---
schemaVersion | `"1.0"`
repoRoot | `string`
generatedAtIso | `string`
files | `FileRecord[]`
totals | `{ fileCount: number, totalBytes: number }`

FileRecord

Field | Type | Notes
---|---|---
path | `string` | repo-relative, posix
bytes | `number` | nonnegative
sha256 | `string` | 64 hex
lang | `string` | e.g. `ts`, `js`, `json`, `md`, `unknown`
isBinary | `boolean` | 
mtimeMs | `number?` | optional

### DepGraphSchema (`src/schemas/depGraph.schema.ts`)

Field | Type
---|---
schemaVersion | `"1.0"`
nodes | `string[]`
edges | `DepEdge[]`

DepEdge

Field | Type
---|---
from | `string`
to | `string`
kind | `"import" | "require" | "dynamicImport"`
isExternal | `boolean`

### SymbolIndexSchema (`src/schemas/symbolIndex.schema.ts`)

Field | Type
---|---
schemaVersion | `"1.0"`
symbols | `Symbol[]`

Symbol

Field | Type
---|---
name | `string`
file | `string`
kind | `"export" | "import" | "function" | "class" | "const" | "type" | "interface" | "unknown"`
exported | `boolean`

### RuntimeSignalsSchema (`src/schemas/runtimeSignals.schema.ts`)

Field | Type
---|---
schemaVersion | `"1.0"`
signals | `RuntimeSignal[]`

RuntimeSignal

Field | Type
---|---
file | `string`
line | `number`
kind | `"spawn" | "exec" | "httpServer" | "httpsServer" | "wsUpgrade" | "setInterval" | "setTimeout" | "chokidarWatch" | "fsWrite" | "envMutation" | "netListen" | "bindAllInterfaces"`
snippet | `string`

### BrainTopologySchema (`src/schemas/topology.schema.ts`)

Field | Type
---|---
schemaVersion | `"1.0"`
nodes | `TopologyNode[]`
edges | `TopologyEdge[]`
metrics | `{ nodeCount: number, edgeCount: number }`

TopologyNode

Field | Type
---|---
id | `string`
label | `string`
kind | `"module" | "subsystem" | "entrypoint" | "sink" | "source" | "unknown"`
riskFlags | `string[]`
centrality | `number`

TopologyEdge

Field | Type
---|---
from | `string`
to | `string`
kind | `"calls" | "imports" | "writes" | "spawns" | "serves" | "unknown"`
riskFlags | `string[]`

### FlowsSchema (`src/schemas/topology.schema.ts`)

Field | Type
---|---
schemaVersion | `"1.0"`
flows | `Flow[]`

Flow

Field | Type
---|---
id | `string`
path | `string[]`
kind | `"exec" | "write" | "net" | "mixed" | "unknown"`
riskFlags | `string[]`

### GapsReportSchema (`src/schemas/gapsReport.schema.ts`)

Field | Type
---|---
schemaVersion | `"1.0"`
summary | `{ critical: number, high: number, medium: number, low: number }`
gaps | `GapItem[]`

GapItem

Field | Type
---|---
id | `string`
severity | `"low" | "medium" | "high" | "critical"`
title | `string`
evidence | `Evidence[]`

Evidence

Field | Type
---|---
file | `string`
line | `number?`
note | `string`

### EssencePackSchema (`src/schemas/essence.schema.ts`)

Field | Type
---|---
schemaVersion | `"1.0"`
constraints | `{ maxChars: number, maxEvidencePointers: number, maxNodes: number }`
overview | `string`
keyRisks | `string[]`
topologySummary | `{ nodeCount: number, edgeCount: number, topCentralNodes: string[] }`
evidencePointers | `{ path: string, note: string }[]`

### WrappedArtifactSchema (`src/schemas/wrappedArtifact.schema.ts`)

Field | Type
---|---
identity | `ArtifactIdentity`
payload | `T`

ArtifactIdentity

Field | Type
---|---
schemaVersion | `"1.0"`
snapshotId | `string`
inputHash | `string?`
artifactHash | `string?`

### AdvancedMetricsSchema (`src/schemas/advancedMetrics.schema.ts`)

Field | Type
---|---
schemaVersion | `"1.0"`
pageRank | `Record<string, number>`
betweenness | `Record<string, number>`
gateways | `string[]`
stabilityIndex | `number (0..1)`

### LedgerEntrySchema (`src/schemas/ledger.schema.ts`)

Field | Type
---|---
schemaVersion | `"1.0"`
runId | `string`
atIso | `string`
command | `string`
repoRoot | `string`
inputHash | `string` (sha256 hex)
outputHash | `string` (sha256 hex)
artifacts | `string[]`
notes | `string[]`
advancedMetricsHash | `string?` (sha256 hex)

### ArtifactManifestSchema (`src/schemas/manifest.schema.ts`)

Field | Type
---|---
schemaVersion | `"1.0"`
toolVersion | `string`
repoHash | `string` (sha256 hex)
snapshotId | `string`
runId | `string`
generatedAtIso | `string`
artifacts | `ManifestEntry[]`

ManifestEntry

Field | Type
---|---
pathRel | `string`
sha256 | `string` (sha256 hex)

### LastVerificationSchema (`src/schemas/verification.schema.ts`)

Field | Type
---|---
schemaVersion | `"1.0"`
verifiedAtIso | `string`
hashMatch | `boolean`
schemaValid | `boolean`

### ContractsSnapshotSchema (`src/schemas/contractsSnapshot.schema.ts`)

Field | Type
---|---
schemaVersion | `"1.0"`
repocortexVersion | `string`
nodeVersion | `string`
timestamp | `string`
schemaHashes | `Record<string, string>`
cliSourceHash | `string`

### DiffReportSchema (`src/schemas/diffReport.schema.ts`)

Field | Type
---|---
schemaVersion | `"1.0"`
snapshotId1 | `string`
snapshotId2 | `string`
addedNodes | `string[]`
removedNodes | `string[]`
edgeDelta | `number`
riskDelta | `number`

### DuplicatesReportSchema (`src/schemas/duplicates.schema.ts`)

Field | Type
---|---
schemaVersion | `"1.0"`
pairs | `DuplicatePair[]`

DuplicatePair

Field | Type
---|---
pathA | `string`
pathB | `string`
simhashA | `string`
simhashB | `string`
hamming | `number`

### ImpactReportSchema (`src/schemas/impactReport.schema.ts`)

Field | Type
---|---
schemaVersion | `"1.0"`
nodeId | `string`
forwardCount | `number`
backwardCount | `number`
topNodes | `{ nodeId: string, forward: number, backward: number, total: number }[]`

### TelemetrySchema (`src/schemas/telemetry.schema.ts`)

Field | Type
---|---
schemaVersion | `"1.0"`
scanMs | `number`
graphMs | `number`
topologyMs | `number`
totalMs | `number`

### ConfigSchema (`src/schemas/config.schema.ts`)

Field | Type
---|---
schemaVersion | `"1.0"`
repoRoot | `string`
outputDir | `string`
maxFiles | `number`
maxBytes | `number`
clockIso | `string?`
printPaths | `boolean`
defaultAuditBudgetSek | `number?`

