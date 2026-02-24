# Essence Pack

Repo has 4570 modules and 15720 edges. 4 distinct risk categories detected.

## Top Central Nodes
- src/plugins/runtime/types.ts
- src/plugins/runtime/index.ts
- src/gateway/server.impl.ts
- src/agents/pi-embedded-runner/run/attempt.ts
- src/agents/pi-embedded-runner/compact.ts

## Key Risks
- Cyclic dependency (SCC)
- Net exposure (listen/serve)
- Process execution detected without policy gate
- Writes without ledger pattern