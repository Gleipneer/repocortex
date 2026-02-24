import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

const repoRoot = process.cwd();
const outDir = process.argv[2] || "./full-snapshot";
const absOut = path.resolve(outDir);

fs.mkdirSync(absOut, { recursive: true });

console.log("Running pipeline…");
execSync("node dist/cli/main.js run", { stdio: "inherit" });

const storageRoot = path.join(repoRoot, "storage");

function readIfExists(p) {
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf-8");
}

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

const snapshot = {
  meta: {
    generatedAt: new Date().toISOString(),
    repoRoot
  },
  manifest,
  artifacts
};

const snapshotJson = JSON.stringify(snapshot, null, 2);
const snapshotHash = sha256(snapshotJson);

fs.writeFileSync(
  path.join(absOut, "snapshot.json"),
  JSON.stringify({ snapshotHash, snapshot }, null, 2)
);

console.log("snapshot: ok");
console.log("snapshotHash:", snapshotHash);
