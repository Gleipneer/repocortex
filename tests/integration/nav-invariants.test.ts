import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";
import { sha256 } from "../../src/core/hash.js";

const execFileAsync = promisify(execFile);

async function readLedgerLast(outputDir: string): Promise<{ outputHash: string; lines: number }> {
  const ledgerPath = path.join(outputDir, "ledger", "ledger.jsonl");
  const content = await fs.readFile(ledgerPath, "utf8");
  const lines = content.trim().split("\n").filter(Boolean);
  const last = JSON.parse(lines[lines.length - 1] ?? "{}") as { outputHash?: string };
  return { outputHash: last.outputHash ?? "", lines: lines.length };
}

async function hashManifest(outputDir: string): Promise<string> {
  const buf = await fs.readFile(path.join(outputDir, "system", "manifest.json"));
  return sha256(buf);
}

describe("nav invariants", () => {
  it("nav commands do not mutate manifest/outputHash or append ledger", async () => {
    const cli = path.resolve("dist/cli/main.js");
    const fixtureRepo = path.resolve("tests/fixtures/mini-repo");
    const tmpRoot = path.resolve("tests/.tmp/nav");
    const repoCopy = path.join(tmpRoot, "repo");
    const outDir = path.join(tmpRoot, "out");
    await fs.rm(tmpRoot, { recursive: true, force: true });
    await fs.mkdir(tmpRoot, { recursive: true });
    await fs.cp(fixtureRepo, repoCopy, { recursive: true });

    const iso = "2020-01-01T00:00:00.000Z";
    await execFileAsync("node", [cli, "run", "--repo", repoCopy, "--out", outDir, "--clock-iso", iso]);

    const targetFile = path.join(repoCopy, "src", "index.ts");
    await fs.appendFile(targetFile, "\n// nav-test\n", "utf8");
    await execFileAsync("node", [cli, "run", "--repo", repoCopy, "--out", outDir, "--clock-iso", iso]);

    const manifestBefore = await hashManifest(outDir);
    const ledgerBefore = await readLedgerLast(outDir);

    await execFileAsync("node", [cli, "impact", "src/index.ts", "--out", outDir]);
    await execFileAsync("node", [cli, "rank", "--top", "3", "--out", outDir]);
    await execFileAsync("node", [cli, "risk", "src/index.ts", "--out", outDir]);
    await execFileAsync("node", [cli, "delta", "--out", outDir]);
    await execFileAsync("node", [cli, "essence", "--repo", repoCopy, "--out", outDir, "--focus", "src/index.ts"]);

    const manifestAfter = await hashManifest(outDir);
    const ledgerAfter = await readLedgerLast(outDir);

    expect(manifestAfter).toBe(manifestBefore);
    expect(ledgerAfter.outputHash).toBe(ledgerBefore.outputHash);
    expect(ledgerAfter.lines).toBe(ledgerBefore.lines);
  });
});
