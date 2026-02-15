import { createHash } from "node:crypto";

/**
 * Generate a deterministic runId from inputHash + configHash + timestamp (so same run params yield same id when timestamp is fixed in tests).
 * For production, timestamp makes each run unique; for tests, pass fixed timestamp.
 */
export function createRunId(inputHash: string, configHash: string, timestamp: string): string {
  const payload = [inputHash, configHash, timestamp].join("|");
  return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 16);
}
