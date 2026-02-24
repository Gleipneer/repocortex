# RepoCortex GW Integration Contract (v1.0)

Spec-Version: 1.0
Scope: Integration between GW (Gateway/backbone) and RepoCortex CLI/runtime.

## 1) Input Contract

Field | Type | Required | Description | Source
---|---|---|---|---
repoRoot | `string (absolute path)` | yes | Repository root on local filesystem | `src/cli/main.ts`
outputDir | `string (absolute path)` | yes | Output directory for artifacts | `src/utils/paths.ts`
clockIso | `string (ISO-8601)` | required for deterministic runs | Deterministic time for `self`, recommended for all runs | `src/core/clock.ts`, `src/cli/main.ts`
config | `repocortex.config.json` | optional | Defines defaults for repoRoot/outputDir/guards | `src/schemas/config.schema.ts`
mode | `command` | yes | One of CLI entrypoints (`run`, `pipeline`, `scan`, etc.) | `src/cli/main.ts`

GW must provide filesystem access to repoRoot and outputDir. RepoCortex does not write to repoRoot.

## 2) Output Contract

Output | Path | Schema | Notes
---|---|---|---
Manifest | `system/manifest.json` | `ArtifactManifestSchema` | Hash list for artifacts
Artifact Hash List | `manifest.artifacts[]` | `ManifestEntrySchema` | `pathRel` + `sha256`
Essence Pack | `essence/pack.json` | `EssencePackSchema` or wrapped | Wrapped in pipeline runs
Snapshot | `snapshot.json` | Snapshot internal structure | Produced by `snapshot` command only
Metadata | `ledger/ledger.jsonl`, `telemetry/last_run.json` | `LedgerEntrySchema`, `TelemetrySchema` | Append-only ledger + timings

## 3) Deterministic Guarantee

Guarantee | Conditions | Evidence
---|---|---
Byte-identical artifacts | Same repo state, same outputDir, same deterministic clock | `stableStringify`, sorted lists
Stable manifest | Same artifacts + deterministic clock | `manifest` built from sha256(file)
Stable outputHash | Same artifacts list and contents | `computeOutputHash` in `src/core/artifactHash.ts`

Non-deterministic if:
- No `clockIso` provided for commands that use time (self, verify, metrics, snapshot-contracts).
- Snapshot command embeds real-time `generatedAt` unless caller passes a fixed clock and/or wraps at higher level.

## 4) Change Detection Model

Model | Mechanism | Consumer Action
---|---|---
Artifact-level changes | `system/manifest.json` per-artifact hashes | Compare `pathRel` and `sha256`
Run-level changes | `ledger/ledger.jsonl` outputHash | Compare `outputHash`
Snapshot diff | `diff/diff_<id1>_<id2>.json` | Compare `addedNodes` and `removedNodes`

## 5) Extension Points

Extension | How | Contract
---|---|---
New artifact registration | Add to `src/core/artifactRegistry.ts` | Must include in manifest + outputHash list
Plugin hook (proposal) | Define artifact producer + registry injection | See `docs/PLUGIN_MODEL.md`
Verification hook | Add validator in `src/verification/runVerify.ts` | Must map path to schema

