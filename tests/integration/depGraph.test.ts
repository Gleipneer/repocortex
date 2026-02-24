import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { buildDepGraph } from "../../dist/graph/depGraph.js";

describe("buildDepGraph", () => {
  it("extracts local dependencies and symbols", async () => {
    const tmpRoot = path.join(process.cwd(), "runtime-test-depgraph");

    // Clean + recreate test root
    await fs.rm(tmpRoot, { recursive: true, force: true });
    await fs.mkdir(path.join(tmpRoot, "src"), { recursive: true });

    // Create util.ts
    await fs.writeFile(
      path.join(tmpRoot, "src", "util.ts"),
      `export const answer = 42;`
    );

    // Create index.ts importing util
    await fs.writeFile(
      path.join(tmpRoot, "src", "index.ts"),
      `import { answer } from "./util"; console.log(answer);`
    );

    const fileIndex = {
      files: [
        { path: "src/index.ts", lang: "ts", isBinary: false },
        { path: "src/util.ts", lang: "ts", isBinary: false }
      ]
    };

    const { depGraph } = await buildDepGraph({
      repoRoot: tmpRoot,
      outputDir: path.join(tmpRoot, "out"),
      fileIndex
    });

    expect(depGraph.nodes.length).toBe(2);

    const hasUtilEdge = depGraph.edges.some(
      (e) => e.from === "src/index.ts" && e.to === "src/util.ts"
    );

    expect(hasUtilEdge).toBe(true);

    // cleanup
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });
});
