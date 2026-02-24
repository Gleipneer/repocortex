# RepoCortex Plugin Model (Proposal v0.1)

Status: Proposal only. No runtime implementation in codebase.

## Goals
- Allow external artifact producers to register outputs.
- Ensure artifacts are included in manifest and outputHash.
- Provide verification hooks for schemas.

## TypeScript Interfaces (Proposal)

```ts
export type ArtifactDescriptor = {
  pathRel: string;
  kind: "json" | "text" | "binary";
  schemaId?: string; // optional for JSON
};

export type ArtifactProducerContext = {
  repoRoot: string;
  outputDir: string;
  clockIso?: string;
};

export interface ArtifactProducer {
  id: string;
  produces: ArtifactDescriptor[];
  run(ctx: ArtifactProducerContext): Promise<void>;
}

export type RegistryExtension = {
  command: "scan" | "map" | "gaps" | "essence" | "pipeline" | "metrics" | "custom";
  artifacts: ArtifactDescriptor[];
};

export interface ArtifactRegistryPlugin {
  id: string;
  extendRegistry(): RegistryExtension[];
}

export interface ArtifactVerifier {
  id: string;
  supports: (pathRel: string) => boolean;
  validate: (data: unknown) => void;
}
```

## Integration Rules (Proposal)

Rule | Description
---|---
Registry injection | Plugin registry extensions are appended to `artifactRegistry` lists
Manifest inclusion | Registry outputs must be included in `system/manifest.json`
Verification hook | Validator must be called from `runVerify` for JSON artifacts
Determinism | Plugin outputs must be stable and use deterministic clock when provided

