import path from "node:path";
import fs from "node:fs/promises";

process.env.REPOCORTEX_CLOCK_ISO = "2026-01-01T00:00:00.000Z";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cli = path.resolve("dist/cli/main.js");
const fixtureRepo = path.resolve("tests/fixtures/mini-repo");
const outDir = path.resolve("tests/.tmp/verify-test");

describe("verify", () => {
  it("passes when artifacts and ledger are correct", async () => {
    await fs.rm(outDir, { recursive: true, force: true });
    await fs.mkdir(outDir, { recursive: true });

    await execFileAsync("node", [cli, "run", "--repo", fixtureRepo, "--out", outDir], {
      cwd: path.resolve("."),
      env: { ...process.env, REPOCORTEX_CLOCK_ISO: "2000-01-01T00:00:00.000Z" }
    });

    const { stdout, stderr } = await execFileAsync("node", [cli, "verify", "--out", outDir], {
      cwd: path.resolve(".")
    });

    expect(stderr).toBe("");
    expect(stdout).toContain("Integrity: OK");
    expect(stdout).toContain("Schemas: OK");
    expect(stdout).toContain("Hash match: YES");

    const verificationPath = path.join(outDir, "verification", "last_verification.json");
    const verification = JSON.parse(await fs.readFile(verificationPath, "utf8"));
    expect(verification.schemaVersion).toBe("1.0");
    expect(verification.hashMatch).toBe(true);
    expect(verification.schemaValid).toBe(true);
    expect(verification.verifiedAtIso).toBeDefined();
  });

  it("fails when an artifact file is corrupted", async () => {
    await fs.rm(outDir, { recursive: true, force: true });
    await fs.mkdir(outDir, { recursive: true });

    await execFileAsync("node", [cli, "run", "--repo", fixtureRepo, "--out", outDir], {
      cwd: path.resolve("."),
      env: { ...process.env, REPOCORTEX_CLOCK_ISO: "2000-01-01T00:00:00.000Z" }
    });

    const topologyPath = path.join(outDir, "topology", "brain_topology.json");
    await fs.writeFile(topologyPath, "{ invalid json", "utf8");

    const result = await execFileAsync("node", [cli, "verify", "--out", outDir], {
      cwd: path.resolve(".")
    }).catch((e: { code?: number; stdout?: string; stderr?: string }) => e);

    const exitCode = "code" in result ? result.code : 0;
    const stdout = "stdout" in result ? String(result.stdout) : "";
    expect(exitCode).toBe(1);
    expect(stdout).toMatch(/Hash match: NO|Integrity: FAIL|Schemas: FAIL/);
  });

  it("fails schema validation when rc_metrics.json schemaVersion is corrupted", async () => {
    await fs.rm(outDir, { recursive: true, force: true });
    await fs.mkdir(outDir, { recursive: true });

    await execFileAsync("node", [cli, "run", "--repo", fixtureRepo, "--out", outDir], {
      cwd: path.resolve("."),
      env: { ...process.env, REPOCORTEX_CLOCK_ISO: "2000-01-01T00:00:00.000Z" }
    });

    const rcMetricsPath = path.join(outDir, "rc_metrics.json");
    const rcMetrics = JSON.parse(await fs.readFile(rcMetricsPath, "utf8")) as Record<string, unknown>;
    rcMetrics.schemaVersion = "2.0";
    await fs.writeFile(rcMetricsPath, JSON.stringify(rcMetrics), "utf8");

    const result = await execFileAsync("node", [cli, "verify", "--out", outDir], {
      cwd: path.resolve(".")
    }).catch((e: { code?: number; stdout?: string; stderr?: string }) => e);

    const exitCode = "code" in result ? result.code : 0;
    const stdout = "stdout" in result ? String(result.stdout) : "";
    expect(exitCode).toBe(1);
    expect(stdout).toContain("Schemas: FAIL");
  });
});
