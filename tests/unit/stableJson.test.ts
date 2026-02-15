import { describe, expect, it } from "vitest";
import { deepSortObject, stableStringify } from "../../src/core/stableJson.js";

describe("stableStringify", () => {
  it("sorts keys deterministically", () => {
    const a = { b: 1, a: 2, c: { z: 1, y: 2 } };
    const b = { c: { y: 2, z: 1 }, a: 2, b: 1 };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it("two runs produce byte-identical JSON (deepSortObject regression)", () => {
    const obj = {
      z: 3,
      a: 1,
      m: { y: 2, x: 1, arr: [3, 1, 2] },
      arr: [{ b: 2, a: 1 }, "c"]
    };
    const s1 = stableStringify(obj);
    const s2 = stableStringify(deepSortObject(JSON.parse(s1)));
    expect(s1).toBe(s2);
    const s3 = stableStringify({ ...obj, extra: null });
    const s4 = stableStringify(JSON.parse(s3));
    expect(s3).toBe(s4);
  });
});
