import { describe, expect, it } from "vitest";
import { getStorageRoot, getStoragePaths } from "../../src/utils/paths.js";

describe("paths", () => {
  describe("getStorageRoot", () => {
    it("returns override when provided", () => {
      expect(getStorageRoot("/custom")).toBe("/custom");
    });
    it("returns cwd/storage when no env", () => {
      const orig = process.env["REPOCORTEX_STORAGE"];
      delete process.env["REPOCORTEX_STORAGE"];
      const root = getStorageRoot();
      expect(root).toMatch(/storage$/);
      if (orig !== undefined) process.env["REPOCORTEX_STORAGE"] = orig;
    });
  });

  describe("getStoragePaths", () => {
    it("returns all contract paths for snapshotId", () => {
      const p = getStoragePaths("/root", "snap-1");
      expect(p.fileIndex).toBe("/root/snapshots/snap-1/fileIndex.json");
      expect(p.depGraph).toBe("/root/facts/depGraph.json");
      expect(p.ledger).toBe("/root/ledger/ledger.jsonl");
      expect(p.essencePackJson).toBe("/root/essence/pack.json");
    });
  });
});
