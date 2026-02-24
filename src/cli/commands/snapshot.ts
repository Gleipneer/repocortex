import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
import { writeFileAtomic } from "../../core/io.js";
import { stableStringify } from "../../core/stableJson.js";

function sha256(data: string | Buffer) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function readJsonSafe(p: string) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

async function runSnapshotFull(repoRoot: string, outDir: string) {
  const absRepo = path.resolve(repoRoot);
  const absOut = path.resolve(outDir);
  fs.mkdirSync(absOut, { recursive: true });

  const tmp = path.join(absOut, "__tmp");
  fs.mkdirSync(tmp, { recursive: true });

  console.log("Running export, health, essence...")
  execSync(`node dist/cli/main.js export --format graphml --out ${tmp}`, { stdio: "ignore" });
  execSync(`node dist/cli/main.js health --out ${tmp}`, { stdio: "ignore" });
  execSync(`node dist/cli/main.js essence --out ${tmp}`, { stdio: "ignore" });

  // Läs artifacts
  const artifacts: Record<string, any> = {};
  for (const f of fs.readdirSync(tmp)) {
    const full = path.join(tmp, f);
    if (f.endsWith(".json")) artifacts[f] = readJsonSafe(full);
    else artifacts[f] = fs.readFileSync(full, "utf-8");
  }

  // Filmanifest
  const manifest: any[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (full.includes("node_modules") || full.includes("dist") || full.includes(".git")) continue;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else {
        const buf = fs.readFileSync(full);
        manifest.push({
          path: path.relative(absRepo, full),
          bytes: stat.size,
          sha256: sha256(buf)
        });
      }
    }
  }
  walk(absRepo);
  manifest.sort((a,b)=>a.path.localeCompare(b.path));

  // Ledger + contract hashes
  const ledgerPath = path.join(absRepo, "ledger/ledger.jsonl");
  const ledgerHash = fs.existsSync(ledgerPath) ? sha256(fs.readFileSync(ledgerPath)) : null;
  const contractPath = path.join(absRepo, "contracts");
  let contractHash = null;
  if (fs.existsSync(contractPath)) {
    const allFiles: Buffer[] = [];
    const walkContracts = (dir: string) => {
      for (const f of fs.readdirSync(dir)) {
        const full = path.join(dir, f);
        const st = fs.statSync(full);
        if (st.isDirectory()) walkContracts(full);
        else allFiles.push(fs.readFileSync(full));
      }
    };
    walkContracts(contractPath);
    contractHash = sha256(Buffer.concat(allFiles));
  }

  // Diff mot föregående snapshot (om finns)
  const prevSnapshotPath = path.join(absOut, "snapshot_previous.json");
  let diffSummary = null;
  if (fs.existsSync(prevSnapshotPath)) {
    const prev = readJsonSafe(prevSnapshotPath);
    diffSummary = {
      filesAdded: manifest.filter(m=>!prev.snapshot.manifest.find((p:any)=>p.path===m.path)).map((f:any)=>f.path),
      filesRemoved: prev.snapshot.manifest.filter((p:any)=>!manifest.find((f:any)=>f.path===p.path)).map((f:any)=>f.path)
    };
  }

  // Snapshot object
  const snapshot = {
    meta: { generatedAt: new Date().toISOString(), repoRoot: absRepo },
    manifest,
    artifacts,
    ledgerHash,
    contractHash,
    diffSummary,
    aiAudit: {
      note: "ready for AI ingestion",
      artifactCount: Object.keys(artifacts).length,
      manifestCount: manifest.length
    }
  };

  const snapshotJson = stableStringify(snapshot);
  const snapshotHash = sha256(snapshotJson);

  const final = { snapshotHash, snapshot };

  // Spara snapshot + kopiera till previous
  const snapshotFile = path.join(absOut, "snapshot.json");
  await writeFileAtomic(snapshotFile, stableStringify(final));
  fs.copyFileSync(snapshotFile, path.join(absOut, "snapshot_previous.json"));

  console.log("snapshot: ok");
  console.log("snapshotHash:", snapshotHash);
}

export default runSnapshotFull;
