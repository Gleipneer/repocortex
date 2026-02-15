import { afterAll, describe, expect, it } from "vitest";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendLedgerEntry } from "../../src/utils/ledger.js";

const dummyHash = "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456";

describe("ledger", () => {
  const dir = join(tmpdir(), "repocortex-ledger-test-" + Date.now());
  const ledgerPath = join(dir, "ledger", "ledger.jsonl");

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("creates dir and appends one JSONL entry", async () => {
    await appendLedgerEntry(ledgerPath, {
      schemaVersion: "1.0",
      runId: "run-1",
      atIso: "2025-01-01T00:00:00.000Z",
      command: "status",
      repoRoot: "/repo",
      inputHash: dummyHash,
      outputHash: "b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678",
      artifacts: [],
      notes: []
    });
    const content = await readFile(ledgerPath, "utf8");
    const line = content.trim();
    const entry = JSON.parse(line) as Record<string, unknown>;
    expect(entry.runId).toBe("run-1");
    expect(entry.command).toBe("status");
    expect(entry.repoRoot).toBe("/repo");
  });

  it("appends second entry on same file", async () => {
    await appendLedgerEntry(ledgerPath, {
      schemaVersion: "1.0",
      runId: "run-2",
      atIso: "2025-01-02T00:00:00.000Z",
      command: "scan",
      repoRoot: "/repo",
      inputHash: dummyHash,
      outputHash: dummyHash,
      artifacts: ["fileIndex.json"],
      notes: []
    });
    const content = await readFile(ledgerPath, "utf8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
  });
});
