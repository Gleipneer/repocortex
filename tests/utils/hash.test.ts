import { describe, expect, it } from "vitest";
import { hashString, hashBuffer, hashJson } from "../../src/utils/hash.js";

describe("hash", () => {
  describe("hashString", () => {
    it("returns same hash for same input", () => {
      expect(hashString("hello")).toBe(hashString("hello"));
    });
    it("returns different hash for different input", () => {
      expect(hashString("hello")).not.toBe(hashString("world"));
    });
    it("returns 64-char hex", () => {
      const h = hashString("x");
      expect(h).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("hashBuffer", () => {
    it("returns same hash for same buffer", () => {
      const b = Buffer.from("hello", "utf8");
      expect(hashBuffer(b)).toBe(hashBuffer(Buffer.from("hello", "utf8")));
    });
  });

  describe("hashJson", () => {
    it("returns same hash for same object regardless of key order", () => {
      const a = hashJson({ z: 1, a: 2 });
      const b = hashJson({ a: 2, z: 1 });
      expect(a).toBe(b);
    });
    it("returns different hash for different values", () => {
      expect(hashJson({ a: 1 })).not.toBe(hashJson({ a: 2 }));
    });
    it("is deterministic for arrays", () => {
      expect(hashJson([1, 2, 3])).toBe(hashJson([1, 2, 3]));
    });
  });
});
