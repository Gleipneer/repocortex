import { describe, expect, it } from "vitest";
import { createRunId } from "../../src/utils/runId.js";

describe("createRunId", () => {
  it("is deterministic for same inputs", () => {
    const a = createRunId("in1", "cfg1", "2025-01-01T00:00:00Z");
    const b = createRunId("in1", "cfg1", "2025-01-01T00:00:00Z");
    expect(a).toBe(b);
  });
  it("differs when input hash differs", () => {
    const a = createRunId("in1", "cfg1", "2025-01-01T00:00:00Z");
    const b = createRunId("in2", "cfg1", "2025-01-01T00:00:00Z");
    expect(a).not.toBe(b);
  });
  it("returns 16-char hex", () => {
    const id = createRunId("x", "y", "z");
    expect(id).toMatch(/^[a-f0-9]{16}$/);
  });
});
