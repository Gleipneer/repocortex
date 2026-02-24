import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function readTextIfExists(p) {
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf-8");
}

function readJsonIfExists(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (val && !val.startsWith("--")) {
      args[key] = val;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function walkManifest(rootDir, outDir) {
  const results = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);

      // Never traverse snapshot output directory
      if (full.startsWith(outDir)) continue;

      let stat;
      try {
        stat = fs.lstatSync(full); // lstat, not stat
      } catch {
        continue;
      }

      // Skip symlinks entirely (prevents ELOOP)
      if (stat.isSymbolicLink()) continue;

      const rel = path.relative(rootDir, full);

      // Skip noise everywhere
      if (
        rel.includes("node_modules") ||
        rel.startsWith(".git") ||
        rel.startsWith("dist")
      ) {
        continue;
      }

      if (stat.isDirectory()) {
        walk(full);
      } else {
        const buf = fs.readFileSync(full);
        results.push({
          path: rel,
          bytes: stat.size,
          sha256: sha256(buf)
        });
      }
    }
  }

  walk(rootDir);
  results.sort((a, b) => a.path.localeCompare(b.path));
  return results;
}

function tryCmd(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, stdio: ["ignore", "pipe", "pipe"] })
      .toString("utf-8")
      .trim();
  } catch {
    return null;
  }
}

// ----------------------

const args = parseArgs(process.argv.slice(2));

const engine = path.resolve(args.engine || process.cwd());
const target = path.resolve(args.target || ".");
const outDir = path.resolve(args.out || "./snapshot-out");
const scope = (args.scope || "target").toString();

ensureDir(outDir);
const engineOut = path.join(outDir, "__engine_storage");
ensureDir(engineOut);

const snapshotFile = path.join(outDir, "snapshot.json");
const prevSnapshotFile = path.join(outDir, "snapshot_previous.json");

if (fs.existsSync(snapshotFile)) {
  fs.copyFileSync(snapshotFile, prevSnapshotFile);
}

console.log("ENGINE :", engine);
console.log("TARGET :", target);
console.log("OUT    :", outDir);
console.log("SCOPE  :", scope);
console.log("");

console.log("Running engine pipeline…");

execSync(
  `node dist/cli/main.js run --repo "${target}" --out "${engineOut}"`,
  { cwd: engine, stdio: "inherit" }
);

const artifacts = {
  topology: readTextIfExists(
    path.join(engineOut, "topology/brain_topology.json")
  ),
  gaps: readTextIfExists(path.join(engineOut, "analysis/gaps_report.md")),
  essence: readTextIfExists(path.join(engineOut, "essence/pack.md"))
};

const ledgerPath = path.join(engineOut, "ledger/ledger.jsonl");
const ledgerHash = fs.existsSync(ledgerPath)
  ? sha256(fs.readFileSync(ledgerPath))
  : null;

const contractsDir = path.join(engine, "contracts");
let contractHash = null;

if (fs.existsSync(contractsDir)) {
  const buffers = [];
  function walkContracts(dir) {
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      const st = fs.lstatSync(full);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walkContracts(full);
      else buffers.push(fs.readFileSync(full));
    }
  }
  walkContracts(contractsDir);
  contractHash = sha256(Buffer.concat(buffers));
}

let targetManifest = null;
let engineManifest = null;

if (scope === "target" || scope === "both") {
  console.log("Building target manifest…");
  targetManifest = walkManifest(target, outDir);
}

if (scope === "engine" || scope === "both") {
  console.log("Building engine manifest…");
  engineManifest = walkManifest(engine, outDir);
}

let diffSummary = null;

if (fs.existsSync(prevSnapshotFile)) {
  const prev = JSON.parse(fs.readFileSync(prevSnapshotFile, "utf-8"));
  const prevTarget = prev?.snapshot?.targetManifest || [];
  const prevEngine = prev?.snapshot?.engineManifest || [];

  function diff(prevArr, currArr) {
    const prevMap = new Map(prevArr.map(f => [f.path, f.sha256]));
    const currMap = new Map(currArr.map(f => [f.path, f.sha256]));
    const filesAdded = [];
    const filesRemoved = [];
    const filesChanged = [];

    for (const [p, h] of currMap) {
      if (!prevMap.has(p)) filesAdded.push(p);
      else if (prevMap.get(p) !== h) filesChanged.push(p);
    }

    for (const p of prevMap.keys()) {
      if (!currMap.has(p)) filesRemoved.push(p);
    }

    return { filesAdded, filesRemoved, filesChanged };
  }

  diffSummary = {
    target: targetManifest ? diff(prevTarget, targetManifest) : null,
    engine: engineManifest ? diff(prevEngine, engineManifest) : null
  };
}

const engineGitHead = tryCmd("git rev-parse HEAD", engine);
const targetGitHead = tryCmd("git rev-parse HEAD", target);

const snapshot = {
  meta: {
    generatedAt: new Date().toISOString(),
    engine,
    target,
    scope
  },
  ids: {
    engineGitHead,
    targetGitHead
  },
  targetManifest,
  engineManifest,
  artifacts,
  ledgerHash,
  contractHash,
  diffSummary
};

const snapshotJson = JSON.stringify(snapshot, null, 2);
const snapshotHash = sha256(snapshotJson);

fs.writeFileSync(
  snapshotFile,
  JSON.stringify({ snapshotHash, snapshot }, null, 2)
);

console.log("");
console.log("snapshot: ok");
console.log("snapshotHash:", snapshotHash);
console.log("file:", snapshotFile);
