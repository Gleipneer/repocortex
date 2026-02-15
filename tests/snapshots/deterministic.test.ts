import { describe, expect, it } from "vitest";
import { hashJson } from "../../src/utils/hash.js";

/**
 * Snapshot test: same structured input must produce same hash (determinism gate).
 */
describe("deterministic snapshot", () => {
  it("fileIndex-like structure hashes deterministically", () => {
    const fileIndex = {
      runId: "test-run-1",
      entries: [
        { path: "src/a.ts", hash: "a1b2c3" },
        { path: "src/b.ts", hash: "d4e5f6" }
      ]
    };
    const h = hashJson(fileIndex);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(hashJson(fileIndex)).toBe(h);
  });

  it("object key order does not change hash", () => {
    const o1 = { runId: "r1", entries: [{ path: "p", hash: "h" }] };
    const o2 = { entries: [{ path: "p", hash: "h" }], runId: "r1" };
    expect(hashJson(o1)).toBe(hashJson(o2));
  });

  it("deterministic JSON output snapshot", () => {
    const output = {
      runId: "snap-run-1",
      inputHash: hashJson({ paths: ["src/a.ts", "src/b.ts"] }),
      entries: [
        { path: "src/a.ts", hash: "sha256:a1b2" },
        { path: "src/b.ts", hash: "sha256:c3d4" }
      ]
    };
    expect(output).toMatchSnapshot();
  });
});
