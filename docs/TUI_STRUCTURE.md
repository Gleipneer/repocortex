# RepoCortex TUI/GUI Structure (v1.0)

Spec-Version: 1.0
Purpose: Provide a view model that can drive CLI help, TUI, and GUI.

## Command Tree (Source: `src/cli/main.ts`)

```text
repocortex
  status
  init
  run
  inspect
  metrics
  verify
  snapshot-contracts
  export
  impact
  duplicates
  health
  diff
  scan
  map
  gaps
  essence
  self
  pipeline
  audit
```

## Help Data Model (Suggested)

Field | Description
---|---
command | CLI command name
summary | One-line description
options | Array of option definitions
outputs | Known artifact outputs
errors | Known error conditions

## Artifact Explorer

View | Data Source | Fields
---|---|---
Artifact List | `system/manifest.json` | `pathRel`, `sha256`
Artifact Viewer | File by `pathRel` | Render JSON or text

## Manifest Viewer

Fields | Description
---|---
schemaVersion | Manifest schema version
toolVersion | RepoCortex version
repoHash | Input hash from scan
snapshotId | Snapshot id
runId | Run id
generatedAtIso | Clock timestamp
artifacts | List of `pathRel` + `sha256`

## Diff Viewer

Data Source | Fields
---|---
`diff/diff_<id1>_<id2>.json` | `addedNodes`, `removedNodes`, `edgeDelta`, `riskDelta`

## Run Inspector

Data Source | Fields
---|---
`ledger/ledger.jsonl` (last line) | `runId`, `atIso`, `command`, `repoRoot`, `inputHash`, `outputHash`, `artifacts`
`verification/last_verification.json` | `hashMatch`, `schemaValid`, `verifiedAtIso`
`telemetry/last_run.json` | `scanMs`, `graphMs`, `topologyMs`, `totalMs`

## Search Index Keys

Key | Source
---|---
artifact.pathRel | `system/manifest.json`
artifact.sha256 | `system/manifest.json`
ledger.runId | `ledger/ledger.jsonl`
ledger.outputHash | `ledger/ledger.jsonl`
snapshotId | `system/manifest.json`, `ledger/ledger.jsonl`

