import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createConfig } from "../../src/config/createConfig.js";
import { getConfigPath } from "../../src/config/loadConfig.js";
import { parseRepocortexConfig } from "../../src/core/validate.js";

const execFileAsync = promisify(execFile);
const cli = path.resolve("dist/cli/main.js");
const fixtureRepo = path.resolve("tests/fixtures/mini-repo");
const tmpDir = path.resolve("tests/.tmp/bootstrap");
const uxtestDir = path.resolve("tests/.tmp/uxtest");

describe("bootstrap (init / run / inspect)", () => {
  it("CLI init with --non-interactive creates valid config at --config path", async () => {
    await fs.rm(uxtestDir, { recursive: true, force: true });
    await fs.mkdir(uxtestDir, { recursive: true });
    const configRel = "tests/.tmp/uxtest/repocortex.config.json";
    await execFileAsync(
      "node",
      [
        cli,
        "init",
        "--repo",
        fixtureRepo,
        "--out",
        "tests/.tmp/uxtest",
        "--config",
        configRel,
        "--non-interactive"
      ],
      { cwd: path.resolve(".") }
    );
    const configPath = path.resolve(configRel);
    const raw = JSON.parse(await fs.readFile(configPath, "utf8")) as unknown;
    const config = parseRepocortexConfig(raw);
    expect(config.schemaVersion).toBe("1.0");
    expect(config.repoRoot).toBeDefined();
    expect(config.outputDir).toBeDefined();
    expect(config.maxFiles).toBe(50000);
    expect(config.maxBytes).toBe(2000000000);
  });

  it("run with --config uses config and produces artifacts under outputDir", async () => {
    await fs.rm(uxtestDir, { recursive: true, force: true });
    await fs.mkdir(uxtestDir, { recursive: true });
    await execFileAsync(
      "node",
      [
        cli,
        "init",
        "--repo",
        fixtureRepo,
        "--out",
        "tests/.tmp/uxtest",
        "--config",
        "tests/.tmp/uxtest/repocortex.config.json",
        "--non-interactive"
      ],
      { cwd: path.resolve(".") }
    );
    await execFileAsync(
      "node",
      [cli, "run", "--config", "tests/.tmp/uxtest/repocortex.config.json"],
      {
        cwd: path.resolve("."),
        env: { ...process.env, REPOCORTEX_CLOCK_ISO: "2000-01-01T00:00:00.000Z" }
      }
    );
    const ledgerPath = path.join(uxtestDir, "ledger", "ledger.jsonl");
    const content = await fs.readFile(ledgerPath, "utf8");
    const lines = content.trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const topologyPath = path.join(uxtestDir, "topology", "brain_topology.json");
    await fs.access(topologyPath);
  });

  it("init creates config file", async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.mkdir(tmpDir, { recursive: true });

    const configPath = await createConfig({
      projectRoot: tmpDir,
      repoRoot: fixtureRepo,
      outputDir: path.join(tmpDir, "storage")
    });

    expect(configPath).toBe(getConfigPath(tmpDir));
    const raw = JSON.parse(await fs.readFile(configPath, "utf8")) as unknown;
    const config = parseRepocortexConfig(raw);
    expect(config.schemaVersion).toBe("1.0");
    expect(config.maxFiles).toBe(50000);
    expect(config.outputDir).toContain("storage");
  });

  it("run uses config and succeeds", async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.mkdir(tmpDir, { recursive: true });
    await createConfig({
      projectRoot: tmpDir,
      repoRoot: fixtureRepo,
      outputDir: path.join(tmpDir, "out")
    });

    const { stdout, stderr } = await execFileAsync("node", [cli, "run"], {
      cwd: tmpDir,
      env: { ...process.env, REPOCORTEX_CLOCK_ISO: "2000-01-01T00:00:00.000Z" }
    });

    expect(stderr).toBe("");
    expect(stdout).toContain("RepoCortex Run Summary");
    expect(stdout).toContain("Status: SUCCESS");
    expect(stdout).toContain("Snapshot:");
    expect(stdout).toMatch(/Artifacts:|topology\/brain_topology\.json/);

    const ledgerPath = path.join(tmpDir, "out", "ledger", "ledger.jsonl");
    const content = await fs.readFile(ledgerPath, "utf8");
    const lines = content.trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });

  it("run fails without config", async () => {
    const emptyDir = path.resolve("tests/.tmp/bootstrap-no-config");
    await fs.rm(emptyDir, { recursive: true, force: true });
    await fs.mkdir(emptyDir, { recursive: true });

    let caught = false;
    try {
      await execFileAsync("node", [cli, "run"], { cwd: emptyDir });
    } catch (err: unknown) {
      caught = true;
      const e = err as { stderr?: string; stdout?: string };
      const msg = (e.stderr ?? e.stdout ?? String(err)).toLowerCase();
      expect(msg).toMatch(/config not found|repocortex init/);
    }
    expect(caught).toBe(true);
  });

  it("inspect reads latest ledger", async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.mkdir(tmpDir, { recursive: true });
    await createConfig({
      projectRoot: tmpDir,
      repoRoot: fixtureRepo,
      outputDir: path.join(tmpDir, "out")
    });
    await execFileAsync("node", [cli, "run"], {
      cwd: tmpDir,
      env: { ...process.env, REPOCORTEX_CLOCK_ISO: "2000-01-01T00:00:00.000Z" }
    });

    const { stdout } = await execFileAsync("node", [cli, "inspect"], {
      cwd: tmpDir
    });

    expect(stdout).toContain("Latest run");
    expect(stdout).toContain("runId:");
    expect(stdout).toMatch(/outputHash:|Artifacts:/);
    expect(stdout).toMatch(/Paths:|Counts:/);
  });
});
