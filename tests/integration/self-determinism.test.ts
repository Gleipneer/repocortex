import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";
import { sha256 } from "../../src/core/hash.js";

const execFileAsync = promisify(execFile);

async function hashManifest(outputDir: string): Promise<string> {
  const buf = await fs.readFile(path.join(outputDir, "system", "manifest.json"));
  return sha256(buf);
}

async function outputHashFromLedger(outputDir: string): Promise<string> {
  const ledgerPath = path.join(outputDir, "ledger", "ledger.jsonl");
  const content = await fs.readFile(ledgerPath, "utf8");
  const lines = content.trim().split("\n").filter(Boolean);
  const last = JSON.parse(lines[lines.length - 1] ?? "{}") as { outputHash?: string };
  return last.outputHash ?? "";
}

describe("self determinism", () => {
  it("self run twice with same clockIso yields identical manifest + outputHash", async () => {
    const cli = path.resolve("dist/cli/main.js");
    const fixtureRepo = path.resolve("tests/fixtures/mini-repo");
    const out1 = path.resolve("tests/.tmp/self1");
    const out2 = path.resolve("tests/.tmp/self2");
    await fs.rm(out1, { recursive: true, force: true });
    await fs.rm(out2, { recursive: true, force: true });

    const iso = "2020-01-01T00:00:00.000Z";
    await execFileAsync("node", [cli, "self", "--out", out1, "--clock-iso", iso], {
      cwd: fixtureRepo
    });
    await execFileAsync("node", [cli, "self", "--out", out2, "--clock-iso", iso], {
      cwd: fixtureRepo
    });

    expect(await hashManifest(out1)).toBe(await hashManifest(out2));
    expect(await outputHashFromLedger(out1)).toBe(await outputHashFromLedger(out2));
  });
});
