# RepoCortex User Guide

Quickstart and reference for the RepoCortex CLI (config-driven, **Mode C: flags-first**, prompt fallback when flags are missing and not `--non-interactive`).

---

## Quickstart

1. **Create config** (first time):

   ```bash
   repocortex init --repo . --out ./storage
   ```

   Or use prompts (omit flags):

   ```bash
   repocortex init
   ```

2. **Run pipeline** (uses config):

   ```bash
   repocortex run
   ```

3. **Inspect latest run** (no new analysis):

   ```bash
   repocortex inspect
   ```

---

## Commands

### init

Creates `repocortex.config.json`. Flags take priority; missing values can be prompted (unless `--non-interactive`).

- **--repo &lt;path&gt;** — Repo root (default: current directory).
- **--out &lt;path&gt;** — Output dir (default: `./storage`).
- **--max-files &lt;n&gt;** — Max file count (default: 50000).
- **--max-bytes &lt;n&gt;** — Max total bytes (default: 2000000000).
- **--clock-iso &lt;iso&gt;** — Fixed clock for determinism (ISO string).
- **--config &lt;path&gt;** — Where to write config (default: `./repocortex.config.json`).
- **--force** — Overwrite existing config.
- **--non-interactive** — No prompts; fail if required values missing.

### run

Loads config (or uses `--repo` with defaults), runs the full pipeline. **Always** prints Run Summary; prints artifact paths when `printPaths` is true (default).

- **--config &lt;path&gt;** — Config file (default: `./repocortex.config.json`).
- **--repo &lt;path&gt;** — Repo root (overrides config; allows run without config file).
- **--out &lt;path&gt;** — Output dir (overrides config/env).
- **--max-files &lt;n&gt;** / **--max-bytes &lt;n&gt;** — Override limits.
- **--clock-iso &lt;iso&gt;** — Override clock.
- **--print-paths** / **--no-print-paths** — Print artifact paths (default: true).

If neither config nor `--repo` is provided, run exits with an error and suggests `repocortex init`.

### inspect

Reads the **last ledger line** from the output dir, prints runId, atIso, command, repoRoot, snapshotId, outputHash, **artifact paths**, and optionally **counts** (nodes, edges, gaps high/medium/low). No new analysis.

- **--config &lt;path&gt;** — Config file to get outputDir.
- **--out &lt;path&gt;** — Output dir (overrides config; use when no config).

---

## Config file

- **Location:** Default `./repocortex.config.json` (or `--config <path>`).
- **Schema:** `schemaVersion: "1.0"`, `repoRoot`, `outputDir`, `maxFiles`, `maxBytes`, optional `clockIso`, `printPaths` (default true).
- **Paths in config:** Resolved relative to **current working directory** (where you run the CLI), not relative to the config file path.

---

## Override priority

**CLI &gt; ENV &gt; CONFIG &gt; DEFAULTS**

- **REPOCORTEX_STORAGE** — Overrides `outputDir` when set.
- **REPOCORTEX_CLOCK_ISO** — Overrides `clockIso` when set.

---

## Where artifacts live

All writes are under the resolved **output dir** (config `outputDir`, or `--out`, or `REPOCORTEX_STORAGE`):

- `snapshots/{snapshotId}/fileIndex.json`
- `facts/depGraph.json`, `facts/symbolIndex.json`, `facts/runtimeSignals.json`
- `topology/brain_topology.json`, `topology/flows.json`
- `analysis/gaps_report.json`, `analysis/gaps_report.md`
- `essence/pack.json`, `essence/pack.md`
- `ledger/ledger.jsonl`

No writes are made to the repo root (`repoRoot`).

---

## Determinism

- Same repo content + same config + **same clock** ⇒ same artifact content and content hashes.
- Set **REPOCORTEX_CLOCK_ISO** (or `clockIso` in config / `--clock-iso`) to a fixed ISO timestamp for reproducible runs and ledger `runId`/`atIso`.
