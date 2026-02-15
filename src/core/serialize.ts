import { stableStringify } from "./stableJson.js";

/**
 * All schema outputs must be written using this so that JSON is deterministic
 * (sorted keys, no key-order dependence).
 */
export function toOutputJson(value: unknown): string {
  return stableStringify(value);
}
