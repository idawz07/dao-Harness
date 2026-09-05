# Agent Note: Dao reference store MVP

Status: implemented

## Problem

Scribe's job is to organize durable reference material for later retrieval, but Stage 4 shipped only filesystem read/search tools. Without a Host-owned document store and model-facing ingest/search tools, specialists could only summarize paths — they could not keep a durable, searchable corpus that survives across turns.

## Decision

Ship a `references` capability as two packages:

1. `@daoai/dao-references` — singular `ctx.references` Store over a storage-domain unit (`references` v0) with `documents` and `chunks` tables. Fixed ~2000-char windows with ~200-char overlap; SHA-256 chunk hashes; keyword search (tokenize on non-alphanumeric, casefold, score = sum of query-term frequencies / chunk token count).
2. `@daoai/dao-tool-references` — six tools (`reference_add`, `reference_search`, `reference_get`, `reference_list`, `reference_remove`, `reference_index`) plus a short system-prompt section.

Wire both into the Scribe preset only. Keep them as workspace dependencies of `dao-base` and `python/sdk-runtime` so presets resolve, but do not mount them on the host base cordis by default. Extend `subagent_scribe` toolFilters in `standard`, `ptc`, and `cordis` so orchestrator-spawned Scribe children see the new tools.

## Alternatives considered

- **Mount on host base for every surface** — rejected: generalist agents do not need the store by default; Scribe ownership keeps blast radius small.
- **Embeddings / vector search in MVP** — deferred: keyword scoring is enough for Stage 5 verification; vectors remain a Known Limitation.
- **Typert Remote + Web `@doc` UI in the same PR** — deferred (B1b UI half): `index()` and `reference_index` ship so navigation works for the model; browser mention completion waits.
- **Session-query panel inside a reference UI (B3)** — deferred until a product surface owns that panel.

## Consequences

Scribe direct sessions and `subagent_scribe` children can ingest and keyword-search durable references. Host compositions that omit the Scribe mount still lack the tools. Custom rich cards beyond generic/search presenters remain deferred. Release-member packages use `publishConfig.access: public` (workspace constraints forbid `private: true` under `packages/<group>/<pkg>`).

## Required verification

- `pnpm --filter @daoai/dao-references test` — chunking, scoring, CRUD over MemoryStorageBackend.
- `pnpm --filter @daoai/dao-tool-references test` — Loader composition mounts storage-json + storage-domain + references + tool-references; `reference_add` → `reference_search` round trip.
- `pnpm run gen-tsconfig-paths` — package aliases for the new group.
- Preset wiring: Scribe `agent.cordis.yml` mounts both packages; `subagent_scribe` allow-lists include the six tools.
