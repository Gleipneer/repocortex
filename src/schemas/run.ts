/**
 * Run metadata: runId, timestamp, inputHash, outputHash.
 * Timestamps are isolated here so deterministic outputs exclude them.
 */
export interface RunMeta {
  runId: string;
  timestamp: string; // ISO8601
  inputHash: string;
  outputHash: string;
  configHash?: string;
}
