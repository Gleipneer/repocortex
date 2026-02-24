import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function readIfExists(p) {
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf-8");
}

const repoRoot = process.cwd();
const outDir = process.argv[2] || "./full-snapshot";
const absOut = path.resolve(outDir);
const snapshotFile = path.join(absOut, "snapshot.json");

fs.mkdirSync(absOut, { recursive: true });

console.log("Running pipeline…");
execSync("node dist/cli/main.js run", { stdio: "inherit" });

const storageRoot = path.join(repoRoot, "storage");

const artifacts = {
  topology: readIfExists(path.join(storageRoot, "topology/brain_topology.json")),
  gaps: readIfExists(path.join(storageRoot, "analysis/gaps_report.md")),
  essence: readIfExists(path.join(storageRoot, "essence/pack.md"))
};

const manifest = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (full.includes("node_modules") || full.includes("dist") || full.includes(".git")) continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full);
    else {
      const buf = fs.readFileSync(full);
      manifest.push({
        path: path.relative(repoRoot, full),
        bytes: stat.size,
        sha256: sha256(buf)
      });
    }
  }
}

walk(repoRoot);
manifest.sort((a,b)=>a.path.localeCompare(b.path));

/* ===== Ledger hash ===== */
const ledgerPath = path.join(storageRoot, "ledger/ledger.jsonl");
const ledgerHash = fs.existsSync(ledgerPath)
  ? sha256(fs.readFileSync(ledgerPath))
  : null;

/* ===== Contracts hash ===== */
const contractsDir = path.join(repoRoot, "contracts");
let contractHash = null;

if (fs.existsSync(contractsDir)) {
  const buffers = [];
  function walkContracts(dir) {
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walkContracts(full);
      else buffers.push(fs.readFileSync(full));
    }
  }
  walkContracts(contractsDir);
  contractHash = sha256(Buffer.concat(buffers));
}

/* ===== Diff against previous snapshot ===== */
let diffSummary = null;

if (fs.existsSync(snapshotFile)) {
  const previous = JSON.parse(fs.readFileSync(snapshotFile, "utf-8"));
  const prevManifest = previous.snapshot.manifest;

  const prevMap = new Map(prevManifest.map(f => [f.path, f.sha256]));
  const currentMap = new Map(manifest.map(f => [f.path, f.sha256]));

  const filesAdded = [];
  const filesRemoved = [];
  const filesChanged = [];

  for (const [p, h] of currentMap) {
    if (!prevMap.has(p)) filesAdded.push(p);
    else if (prevMap.get(p) !== h) filesChanged.push(p);
  }

  for (const p of prevMap.keys()) {
    if (!currentMap.has(p)) filesRemoved.push(p);
  }

  diffSummary = { filesAdded, filesRemoved, filesChanged };
}

const snapshot = {
  meta: {
    generatedAt: new Date().toISOString(),
    repoRoot
  },
  manifest,
  artifacts,
  ledgerHash,
  contractHash,
  diffSummary,
  aiContext: {
    artifactCount: Object.keys(artifacts).length,
    manifestCount: manifest.length,
    readyForIngestion: true
  }
};

const snapshotJson = JSON.stringify(snapshot, null, 2);
const snapshotHash = sha256(snapshotJson);

fs.writeFileSync(
  snapshotFile,
  JSON.stringify({ snapshotHash, snapshot }, null, 2)
);

console.log("snapshot: ok");
console.log("snapshotHash:", snapshotHash);
