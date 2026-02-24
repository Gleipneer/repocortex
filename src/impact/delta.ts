import type { FileIndex } from "../schemas/fileIndex.schema.js";
import type { DepGraph } from "../schemas/depGraph.schema.js";
import type { SymbolIndex } from "../schemas/symbolIndex.schema.js";

export type DeltaResult = {
  addedFiles: string[];
  removedFiles: string[];
  changedFiles: string[];
  addedSymbols: string[];
  removedSymbols: string[];
  dependencyShifts: string[];
};

export function computeFileIndexDelta(prev: FileIndex, next: FileIndex): {
  addedFiles: string[];
  removedFiles: string[];
  changedFiles: string[];
} {
  const prevMap = new Map(prev.files.map((f) => [f.path, f.sha256] as const));
  const nextMap = new Map(next.files.map((f) => [f.path, f.sha256] as const));

  const addedFiles: string[] = [];
  const removedFiles: string[] = [];
  const changedFiles: string[] = [];

  for (const p of nextMap.keys()) {
    if (!prevMap.has(p)) addedFiles.push(p);
  }
  for (const p of prevMap.keys()) {
    if (!nextMap.has(p)) removedFiles.push(p);
  }
  for (const [p, sha] of nextMap.entries()) {
    const prevSha = prevMap.get(p);
    if (prevSha && prevSha !== sha) changedFiles.push(p);
  }

  return {
    addedFiles: addedFiles.sort(),
    removedFiles: removedFiles.sort(),
    changedFiles: changedFiles.sort()
  };
}

export function computeDelta(params: {
  prev: FileIndex;
  next: FileIndex;
  depGraph: DepGraph;
  symbolIndex: SymbolIndex;
}): DeltaResult {
  const { addedFiles, removedFiles, changedFiles } = computeFileIndexDelta(
    params.prev,
    params.next
  );
  const addedSet = new Set(addedFiles);
  const removedSet = new Set(removedFiles);

  const addedSymbols = params.symbolIndex.symbols
    .filter((s) => addedSet.has(s.file))
    .map((s) => `${s.file}::${s.name}`)
    .sort();

  const removedSymbols = params.symbolIndex.symbols
    .filter((s) => removedSet.has(s.file))
    .map((s) => `${s.file}::${s.name}`)
    .sort();

  const dependencyShifts = params.depGraph.edges
    .filter((e) => addedSet.has(e.from) || addedSet.has(e.to) || removedSet.has(e.from))
    .map((e) => `${e.from} -> ${e.to}`)
    .sort();

  return {
    addedFiles,
    removedFiles,
    changedFiles,
    addedSymbols,
    removedSymbols,
    dependencyShifts
  };
}
