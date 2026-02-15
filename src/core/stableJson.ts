/**
 * Recursively sort object keys and array elements for deterministic output.
 * Use before JSON.stringify for byte-identical JSON across runs.
 */
export function deepSortObject<T>(v: T): T {
  if (Array.isArray(v)) return v.map((x) => deepSortObject(x)) as T;
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      out[k] = deepSortObject((v as Record<string, unknown>)[k]);
    }
    return out as T;
  }
  return v;
}

// Deterministic JSON stringify (sort keys recursively)
export function stableStringify(value: unknown): string {
  return JSON.stringify(deepSortObject(value));
}
