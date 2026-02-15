// runId måste vara deterministiskt per körning men unikt.
// Vi gör: timestamp ISOLERAS i ledger; runId = sha256(repoPath + configHash + monotonicCounter?)
// För MVP: runId = sha256(inputHash + startIso).slice(0, 12) där startIso bara finns i ledger.
// Men outputs ska inte bero på startIso.
// Därför: runId genereras och används bara i ledger/audit paths, inte i core outputs.
import { sha256 } from "./hash.js";

export function makeRunId(inputHash: string, startIso: string): string {
  return sha256(`${inputHash}|${startIso}`).slice(0, 12);
}
