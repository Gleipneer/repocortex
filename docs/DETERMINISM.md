# RepoCortex — Determinism

## Gate

Samma input (filset + innehåll) + samma config ⇒ samma outputs.

- **Input**: valda filer i target repo (paths + content).
- **Config**: t.ex. ignore patterns, språkval, output-dir (utan tidsstämpel).
- **Outputs**: fileIndex, depGraph, symbolIndex, runtimeSignals, topology, gaps_report, essence pack (pack.json/pack.md).

## Vad som inte får påverka output

- Tidsstämpel / datum (isoleras i ledger och run-metadata).
- Slump (ingen randomness i pipeline).
- Nätverksanrop (ingen live data i den deterministiska analysen).
- Körning av target code (ingen exec/spawn).

## Var tidsstämpel får finnas

- `ledger/ledger.jsonl`: varje rad har `timestamp`.
- Run-metadata (runId, timestamp) som skrivs vid körning.
- Inga tidsstämpel i fileIndex, depGraph, topology, gaps_report eller essence pack (så att samma repo + config ger samma filer).

## Verifiering

- Snapshot-tester för deterministiska JSON-outputs (t.ex. hash av strukturerade data).
- CI: samma fixture + samma config ⇒ samma snapshot/hash mellan körningar.
