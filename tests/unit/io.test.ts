import { afterAll, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ensureDir,
  getOutputDir,
  readJson,
  readText,
  validateOrThrow,
  writeJsonAtomic
} from "../../src/core/io.js";
import { FileIndexSchema } from "../../src/schemas/fileIndex.schema.js";

describe("io", () => {
  const testDir = join(tmpdir(), "repocortex-io-test-" + Date.now());

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("getOutputDir", () => {
    it("returns override when provided", () => {
      expect(getOutputDir("/custom")).toBe("/custom");
    });
  });

  describe("ensureDir", () => {
    it("creates nested dir and is idempotent", async () => {
      const dir = join(testDir, "a", "b", "c");
      await ensureDir(dir);
      await ensureDir(dir); // second call does not throw
      const { writeFile } = await import("node:fs/promises");
      await writeFile(join(dir, "f"), "x", "utf8");
      const text = await readText(join(dir, "f"));
      expect(text).toBe("x");
    });
  });

  describe("writeJsonAtomic and readJson", () => {
    it("writes then reads back same object", async () => {
      const outDir = join(testDir, "storage1");
      await ensureDir(outDir);
      const filePath = join(outDir, "facts", "test.json");
      const obj = { schemaVersion: "1.0" as const, runId: "r1", nodes: ["a"], edges: [] };
      await writeJsonAtomic(filePath, obj, outDir);
      const read = await readJson(filePath);
      expect(read).toEqual(obj);
    });

    it("uses stableStringify (deterministic key order)", async () => {
      const outDir = join(testDir, "storage2");
      await ensureDir(outDir);
      const filePath = join(outDir, "out.json");
      await writeJsonAtomic(filePath, { z: 1, a: 2 }, outDir);
      const raw = await readText(filePath);
      expect(raw).toBe('{"a":2,"z":1}');
    });

    it("throws when path is outside outputDir", async () => {
      const outDir = join(testDir, "storage3");
      await ensureDir(outDir);
      const escapePath = join(tmpdir(), "escape.json");
      await expect(writeJsonAtomic(escapePath, {}, outDir)).rejects.toThrow("under outputDir");
    });
  });

  describe("readText", () => {
    it("reads file content", async () => {
      const outDir = join(testDir, "storage4");
      await ensureDir(outDir);
      const filePath = join(outDir, "hello.txt");
      const { writeFile } = await import("node:fs/promises");
      await writeFile(filePath, "hello world", "utf8");
      const text = await readText(filePath);
      expect(text).toBe("hello world");
    });
  });

  describe("validateOrThrow", () => {
    it("returns parsed data when valid", () => {
      const data = {
        schemaVersion: "1.0",
        repoRoot: "/r",
        generatedAtIso: "2025-01-01T00:00:00Z",
        files: [],
        totals: { fileCount: 0, totalBytes: 0 }
      };
      const out = validateOrThrow(FileIndexSchema, data);
      expect(out.schemaVersion).toBe("1.0");
      expect(out.repoRoot).toBe("/r");
    });

    it("throws when invalid", () => {
      expect(() => validateOrThrow(FileIndexSchema, { schemaVersion: "2.0" })).toThrow();
    });
  });
});
