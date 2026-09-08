# Agent Note: Dao Stage 7 cutover, replay lane, and quality gates

Status: implemented

## Problem

Stage 7 is the final phase of the Dao rebrand from `deepseek-harness` to `@daoai/dao`. Earlier stages completed package rescoping, schema changes, and model-facing tool surfaces, but left several cross-cutting gaps:
1. Subagent delegation tools needed model-defaulted reasoning effort inheritance and robust background task handling across providers.
2. Replay test lanes required authored-corpus conversion and support for variable snapshot timeouts (`snapshotTimeoutMs`) to prevent false-positive aborts on slower CI or platform runs.
3. Documentation generation, knip hygiene, jscpd clone detection, and the 100% per-file test coverage gate (`test:coverage`) needed all remaining debt closed before cutting over remotes to `daoAI/dao`.

## Decision

1. Subagent effort inheritance and delegation: Subagents inherit the parent model profile's resolved reasoning effort default when none is specified, preventing unintended downgrade or incompatibility during delegation.
2. Replay lane and authored corpus: Converted recorded session replay fixtures to the authored corpus format, ensuring deterministic replays on macOS and Linux without live provider credentials.
3. Configurable snapshot timeouts: Added `snapshotTimeoutMs` configuration to session snapshot test runner and profiles, allowing suites to accommodate variable system latency under heavy local or CI contention.
4. Hygiene and duplication gates: Cleaned obsolete devDependencies (`nanoid`, unneeded subagent test packages), eliminated dead exports, updated `knip.json`, and deduplicated replay mappings in `llm-replay`.
5. Coverage gate closure: Closed per-file 100% coverage misses in `packages/references/references`, `packages/references/tool-references`, `packages/session/squad-progress`, `packages/llm/llm-pi-ai`, `packages/test-support/session-snapshot`, and aligned client-lane debt exclusions in `vitest.config.ts`.

## Alternatives considered

- **Retain loose coverage thresholds for new Stage 5/6 packages** — rejected: repository invariants require per-file 100% coverage on all runtime sources under `packages/*/*/src`, with explicit v8 ignore annotations only for unreachable defensive branches.
- **Hardcode higher timeout values in individual snapshot specs** — rejected: environment-varying execution speed belongs in profile configuration (`snapshotTimeoutMs`), not scattered test constants.

## Consequences

- All repository quality gates (`typecheck`, `lint`, `test`, `test:expected`, `test:snapshot`, `test:coverage`, `doc-sync`, `hygiene`, `duplication`, `website:build`) pass locally.
- The codebase is ready for Stage 7 final remote cutover to GitHub `daoAI/dao`.

## Required verification

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run test`
- `pnpm run test:expected`
- `pnpm run test:snapshot`
- `pnpm run test:coverage`
- `pnpm run doc-sync`
- `pnpm run hygiene`
- `pnpm run duplication`
- `pnpm run website:build`
