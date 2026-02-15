import { createHash } from "node:crypto";

const ALGO = "sha256";
const ENC = "hex" as const;

/**
 * Deterministic hash of string input. Same input => same output.
 */
export function hashString(input: string): string {
  return createHash(ALGO).update(input, "utf8").digest(ENC);
}

/**
 * Deterministic hash of UTF-8 buffer.
 */
export function hashBuffer(buf: Buffer): string {
  return createHash(ALGO).update(buf).digest(ENC);
}

/**
 * Deterministic hash of a JSON-serializable value (sorted keys for objects).
 */
export function hashJson(value: unknown): string {
  const str = stableStringify(value);
  return hashString(str);
}

function stableStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    const parts = value.map((v) => stableStringify(v));
    return "[" + parts.join(",") + "]";
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as object).sort();
    const parts = keys.map(
      (k) => JSON.stringify(k) + ":" + stableStringify((value as Record<string, unknown>)[k])
    );
    return "{" + parts.join(",") + "}";
  }
  return "null";
}
