# Final Validation Report — Plan A MVP

**Date:** 2026-02-15  
**Status:** All gates green. Plan A MVP is production-stable for read-only, deterministic codebase analysis.

---

## Summary of Checks

| Step | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Result       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| 1    | Clean install: `rm -rf node_modules && npm ci && npm run build && npm run lint && npm run typecheck && npm test`                                                                                                                                                                                                                                                                                                                                             | ✅ All green |
| 2    | Determinism: pipeline run twice with same `REPOCORTEX_CLOCK_ISO`; artifact content hashes identical; ledger differs only by design (timestamp/runId when clock varies; with same clock all fields identical)                                                                                                                                                                                                                                                 | ✅ Verified  |
| 3    | File system safety: no writes outside `outputDir`; all `writeFile`/`appendFile`/`writeJsonAtomic` use paths under `outputDir`; `assertUnderOutputDir` in `writeJsonAtomic`; `repoRoot` used only for read                                                                                                                                                                                                                                                    | ✅ Verified  |
| 4    | Contract validation: all artifact writes go through `validateOrThrow(Schema, data)`; all schemas use `schemaVersion: z.literal("1.0")`; unknown schemaVersion throws at parse; `assertSupportedVersion` in e2e                                                                                                                                                                                                                                               | ✅ Verified  |
| 5    | CLI validation: `init` creates config; `run` uses config and prints Run Summary; `run` fails without config; `inspect` reads latest ledger; `scan`/`map`/`gaps`/`essence`/`pipeline` with valid args exit 0; missing `--repo` exit 1; audit without `--cheap` throws and exit 1                                                                                                                                                                              | ✅ Verified  |
| 6    | Edge cases: empty repo, repo without tests, repo without TS/JS (only .md), repo with only binary files — all complete without crash (exit 0)                                                                                                                                                                                                                                                                                                                 | ✅ Verified  |
| 7    | Performance smoke: 250 files pipeline ~0.25s; scanner behavior linear in file count; no observed memory leak                                                                                                                                                                                                                                                                                                                                                 | ✅ Verified  |
| 9    | UX layer (Mode C): Commands **init**, **run**, **inspect**. Flags-first, prompt fallback when not `--non-interactive`. `run`: load config or error with suggestion to run `repocortex init`; always print Run Summary + artifact paths when `printPaths`. `inspect`: read last ledger line, print paths and optional counts (nodes/edges/gaps). Tests: init (CLI + direct), run (with config, without config fails), inspect (latest ledger, paths, counts). | ✅ Verified  |

---

## Test Coverage Result

- **Test files:** 26 (including structural maturity).
- **Tests:** 79 (including verify, snapshot-contracts, export, impact, duplicates, health, diff, stableJson byte-identical).
- **Suites:** unit (io, schemaParse, stableJson, smoke, configSchema), core (ledger), utils (hash, ledger, paths, runId), integration (scan, depGraph, runtimeSignals, topology, gaps, pipeline-e2e, pipeline-determinism, determinism, cli, scan-guards, bootstrap, **verify**, **structural-maturity**), snapshots (deterministic).
- **Bootstrap tests:** CLI init with `--non-interactive` and `--config` creates valid config; run with `--config` produces artifacts under outputDir and prints Run Summary + artifact paths; init creates config (direct); run uses config and succeeds; run fails without config (suggests init); inspect reads latest ledger (runId/outputHash, artifacts, paths, counts).
- **Structural Maturity integration tests:** verify (pass when correct; fail when artifact corrupted); snapshot-contracts (writes contracts_snapshot.json with expected schema); export (deterministic graphml/mermaid/dot, two runs byte-identical); impact (prints reach counts, --save writes impact report); duplicates (writes duplicates.json); health (prints system health score and metrics); diff (two snapshots produce diff report). stableJson: two runs produce byte-identical JSON (deepSortObject regression).
- **CI:** `npm run ci` = format check + lint + typecheck + full test run — all passing.

---

## Determinism Proof — Hash Comparison

- **Setup:** Two pipeline runs with `REPOCORTEX_CLOCK_ISO=2000-01-01T00:00:00.000Z`, same repo `tests/fixtures/mini-repo`, output dirs `tests/.tmp/det1` and `tests/.tmp/det2`.
- **Artifact content hash (all JSON + MD, including snapshot fileIndex):**
  - Run 1: `c53bbb4bc8d907522f05b27f26db42709adfcf02472905ec4ce293975c0f747f`
  - Run 2: `c53bbb4bc8d907522f05b27f26db42709adfcf02472905ec4ce293975c0f747f`
  - **Identical.**
- **Same outputDir, same clock:** Two runs to `tests/.tmp/detSame` produced two ledger lines with identical `runId`, `atIso`, `outputHash`, and artifact list. Ledger differs only when clock or outputDir differs (outputHash includes path in artifact hash when dirs differ).

---

## Safety Verification

- **Writes:** Only under `outputDir` (or `REPOCORTEX_STORAGE` / `--out`).
- **Paths:** All write call sites use `path.join(outputDir, ...)` or `getStoragePaths(outputDir, snapshotId)`; `writeJsonAtomic` enforces `assertUnderOutputDir`.
- **Reads from repo:** `path.join(repoRoot, file.path)` for reading file content only; never write to `repoRoot`.
- **Guards:** Scanner `maxFiles`/`maxBytes` with `--force`; audit `--budget-sek` cap 5 SEK in MVP.

---

## Known Limitations (Explicit)

- **Audit:** Stub only; `--cheap` logs message; no LLM/API call; budget guard is numeric check only.
- **UI:** Not implemented (Plan B/C).
- **Schema version:** Only `1.0` supported; no forward/backward compatibility layer.
- **Large repos:** Default limits 50k files / 2GB; over requires `--force`; no incremental or sparse scan.
- **Determinism:** Requires fixed clock (`REPOCORTEX_CLOCK_ISO`) for identical ledger runId/atIso; artifact content is deterministic regardless.
- **Performance:** Single-threaded; no caching across runs; 250 files ~0.25s, large repos will scale roughly linearly.

---

## Confirmation

Plan A MVP is **production-stable** for:

- Deterministic, read-only codebase analysis.
- Single pipeline (scan → dep graph → runtime signals → topology → gaps → essence) with ledger.
- CLI commands: status, **init** (bootstrap), **run** (config-driven pipeline + Run Summary), **inspect** (latest ledger/gaps), scan, map, gaps, essence, pipeline, audit (stub); **Structural Maturity:** verify, snapshot-contracts, export, impact, duplicates, health, diff.
- **Config:** `repocortex.config.json` schema 1.0; validated; required for `run` without flags; version-locked.
- All writes under configurable output dir; no writes to target repo.
- Schema-validated artifacts and version gate (1.0).
- Edge cases (empty, no tests, no TS/JS, binary-only) and performance smoke (250 files) validated.
