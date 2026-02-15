import { afterAll, describe, expect, it } from "vitest";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendLedger } from "../../src/core/ledger.js";
import { parseLedgerEntry } from "../../src/core/validate.js";

const validHash = "a".repeat(64);

describe("core ledger", () => {
  const dir = join(tmpdir(), "repocortex-core-ledger-" + Date.now());

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("creates ledger dir and appends one JSONL entry", async () => {
    await appendLedger({
      outputDir: dir,
      entry: {
        runId: "run-abc",
        atIso: "2025-01-01T00:00:00.000Z",
        command: "scan",
        repoRoot: "/repo",
        inputHash: validHash,
        outputHash: "b".repeat(64),
        artifacts: ["snapshots/abc/fileIndex.json"],
        notes: []
      }
    });

    const ledgerPath = join(dir, "ledger", "ledger.jsonl");
    const content = await readFile(ledgerPath, "utf8");
    const line = content.trim().split("\n").at(-1)!;
    const entry = JSON.parse(line) as Record<string, unknown>;
    expect(entry.schemaVersion).toBe("1.0");
    expect(entry.runId).toBe("run-abc");
    expect(entry.inputHash).toBe(validHash);
    expect(entry.outputHash).toBe("b".repeat(64));
    expect(entry.command).toBe("scan");
    expect(entry.artifacts).toEqual(["snapshots/abc/fileIndex.json"]);
  });

  it("appends second entry and fills schemaVersion when omitted", async () => {
    await appendLedger({
      outputDir: dir,
      entry: {
        runId: "run-def",
        atIso: "2025-01-02T00:00:00.000Z",
        command: "map",
        repoRoot: "/repo",
        inputHash: validHash,
        outputHash: validHash,
        artifacts: [],
        notes: []
      }
    });

    const ledgerPath = join(dir, "ledger", "ledger.jsonl");
    const content = await readFile(ledgerPath, "utf8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
    const second = JSON.parse(lines[1]!) as Record<string, unknown>;
    expect(second.schemaVersion).toBe("1.0");
    expect(second.runId).toBe("run-def");
  });

  it("parses legacy ledger entry without advancedMetricsHash", () => {
    const legacy = {
      schemaVersion: "1.0",
      runId: "legacy-run",
      atIso: "2020-01-01T00:00:00.000Z",
      command: "pipeline",
      repoRoot: "/repo",
      inputHash: validHash,
      outputHash: validHash,
      artifacts: ["topology/brain_topology.json"],
      notes: []
    };
    const entry = parseLedgerEntry(legacy);
    expect(entry.runId).toBe("legacy-run");
    expect(entry.advancedMetricsHash).toBeUndefined();
  });
});
