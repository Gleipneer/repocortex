import { describe, expect, it } from "vitest";
import { parseRepocortexConfig } from "../../src/core/validate.js";

describe("RepocortexConfig schema", () => {
  it("parses valid config", () => {
    const config = parseRepocortexConfig({
      schemaVersion: "1.0",
      repoRoot: ".",
      outputDir: "./storage",
      maxFiles: 50000,
      maxBytes: 2000000000,
      defaultAuditBudgetSek: 3
    });
    expect(config.schemaVersion).toBe("1.0");
    expect(config.repoRoot).toBe(".");
    expect(config.outputDir).toBe("./storage");
    expect(config.maxFiles).toBe(50000);
    expect(config.maxBytes).toBe(2000000000);
    expect(config.defaultAuditBudgetSek).toBe(3);
  });

  it("rejects schemaVersion !== 1.0", () => {
    expect(() =>
      parseRepocortexConfig({
        schemaVersion: "2.0",
        repoRoot: "",
        outputDir: "./storage",
        maxFiles: 50000,
        maxBytes: 2000000000,
        defaultAuditBudgetSek: 0
      })
    ).toThrow();
  });

  it("rejects missing required fields", () => {
    expect(() =>
      parseRepocortexConfig({
        schemaVersion: "1.0",
        repoRoot: ""
        // outputDir, maxFiles, maxBytes missing
      })
    ).toThrow();
  });

  it("parses with optional clockIso and default printPaths", () => {
    const config = parseRepocortexConfig({
      schemaVersion: "1.0",
      repoRoot: ".",
      outputDir: "./storage",
      maxFiles: 50000,
      maxBytes: 2000000000,
      clockIso: "2020-01-01T00:00:00.000Z"
    });
    expect(config.clockIso).toBe("2020-01-01T00:00:00.000Z");
    expect(config.printPaths).toBe(true);
  });
});
