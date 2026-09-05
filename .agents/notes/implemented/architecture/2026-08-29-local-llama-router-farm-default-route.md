# Agent Note: Local llama-router farm as the default LLM route

Status: implemented

## Problem

The rebrand removes the official DeepSeek API layer from the product, and the key for that route cannot be shared into this repository. The repository's own live LLM traffic — real-model e2e, `demo:ptc`, the owner's interactive runs — needs a route that works without it, and the product's shipped default must point at something the owner actually runs. The resident alternative is the owner's self-hosted Qwen3.8 farm on tailscale: a llama.cpp router card plus four vLLM cards that load one GPU model at a time.

## Decision

The shipped default LLM route is the farm's resident llama.cpp router, served by `dao-llm-pi-ai`, with five hand-declared routes in the base composition (all `api: openai-completions`):

- `llama-router` — the resident systemd card at `http://100.110.212.93:8081/v1`, and the default. It serves eight router presets; `Qwen3.8-27B-Q6_K_XL-128K` is the default model at the route's `reasoning: high` default. Qwen-family thinking uses `thinkingFormat: qwen-chat-template`.
- Four on-demand vLLM cards, declared as routes keyed by the service-manager name (lowercase-hyphen route keys, not the manager's underscored keys):

  | Route | Port | Model | Per-slot context | Role |
  |---|---|---|---|---|
  | `qwen38-quasar-262k` | 18081 | `qwen38-quasar-nvfp4` | 262K | heavy fan-out; 8 active sequences, prefix caching |
  | `qwen38-cyanwiki-192k` | 18080 | `qwen38-cyanwiki-awq-g32` | 192K | quality-first AWQ (G32 W4A16, MTP-2) |
  | `qwen38-unsloth-nvfp4-131k` | 18082 | `qwen38-unsloth-nvfp4` | 131K | alternate (vision + tools) |
  | `qwen38-ninfer-nvfp4full-262k` | 18083 | `qwen38-ninfer-nvfp4full` | 262K | long-context turns (Scout, heavy RAG) |

  The cards are refused only while down; a card started through the service manager (`:8767/api/services`) serves immediately, and each vLLM route carries its `compat` block (`thinkingFormat`, `supportsDeveloperRole`, …) from the pi catalog.

**Default.** `agent-default-model` in the base patch and the agent rows of the headless and ACP test profiles resolve to `llama-router`/`Qwen3.8-27B-Q6_K_XL-128K`. A settings `llm-pi-ai:` section replaces the adapter entry's whole config without a restart, and `agent-default-model` may supply a saved selection that consumers read at creation time.

**Keys.** No key is inlined in the repository. Each route declares an `apiKeyEnv` reference (`LLAMA_ROUTER_API_KEY`, `QWEN38_QUASAR_API_KEY`, …) that the credential store resolves per request; the real router key lives in the gitignored root `.env`, and the four vLLM keys are placeholders until their card first starts. Farm keys do not use the `DAO_` prefix: `BOOTSTRAP_PREFIXES` in `dao-boot/app-boot` rejects `DAO_`-prefixed values from `.env` at boot, and `DAO_*` stays the product's own variable namespace.

**Context windows.** The declared per-model `contextWindow` values are the cards' per-slot sizes (`--ctx-size` / `--parallel`), not trained model windows. pi-ai's `clampMaxTokensToContext` (`simple-options.js`) clamps the wire `max_tokens` to `contextWindow − estimated input − 4096`, so a window declared below `input + 4096 + usable output` degenerates silently to `max_tokens: 1` — one-token output, `length` stop — instead of failing loud.

## Alternatives considered

**Keep `dao-llm-deepseek` as the resident route.** The official DeepSeek route works for the owner personally, but its key cannot be shared into this repository, and the rebrand removes the route and the package. The adapter stays mounted until Stage 3 — user-facing and key-gated — and the `deepseek-official` mock tests keep working through its `DEEPSEEK_BASE_URL` override.

**Farm routes in user settings only.** The pre-farm `llm-pi-ai` mount was dormant with zero routes, in the [declared-catalog design](2026-08-03-pi-ai-declared-provider-catalog.md): routes arrived through a settings section. That keeps the base composition deployment-neutral, but the shipped default would then name a route that exists nowhere by default, and the default model would point at a route only the owner's machine declares. Baking the five routes into the base composition makes the default work out of the box for the rebranded product; the settings-section override remains the per-machine escape hatch.

**Name the farm keys `DAO_*`.** The prefix is the product's variable namespace, and the boot loader rejects `DAO_`-prefixed `.env` values outright, so a `DAO_` farm key would be unbootable in the app and confusing everywhere else.

**Trust the router's advertised context windows.** The router reports slot-agnostic windows; the card's per-slot size is the real capacity. The per-model declaration also exists because the clamp above makes a wrong, too-small value fail one token at a time instead of failing loud.

## Consequences

- The shipped default route requires the owner's farm to be reachable. A machine without it gets a default that fails loud at request time; the user-plane escape is a settings `llm-pi-ai:` section or a saved model selection.
- `dao-llm-deepseek`, the base `llm-deepseek` row, the `web-search` `searchProvider: deepseek-official`, and the package-level DeepSeek e2e remain key-gated until Stage 3 removes them.
- The recorded corpus stays frozen: `*.expected.e2e.ts` (excluded from `test:e2e`), `test:snapshot`, and the `.cordis.snapshot.yml` scenarios still pin the pre-rebrand route and model; the re-record is Stage 7's. The Stage 1 codemod excluded all of `snapshots/` as frozen, which also excluded the live harness code in it — this change renamed the harness-only import specifiers there and touched no recorded data.
- The ACP test profile is a standalone file. It used to symlink the frozen `snapshots/acp/escalation-approved/cordis.yml` composition, which is recorded data, not a live test config.
- The rebrand codemod's word-boundary rules also left snake_case `dsh_` tokens they structurally cannot reach: the Python SDK's public `dsh_bin`/`dsh_home` fields, the code-runtime reserved `__dao_main__` slot (a Python-backend bootstrap token whose runtime is not in this repository), E2B shell-local `dsh_e2b_*` variables, and the `dsh_session_log`/`dsh_plugin_packages` wire fields. The rebrand's Stage 3 owns their disposition alongside the DeepSeek-layer removal.

## Testing

- The e2e config probes the router port synchronously (3 s timeout) and freezes `DAO_FARM_REACHABLE` for the run; real-model suites self-skip on it the way the [key-based skip](../testing/2026-06-19-real-api-e2e-ci.md) did, so CI without tailscale skips fast. vLLM-card tests run only when the owner has started the card.
- The `built-bin` mock tests run the shipped profiles, whose default route is now `llama-router`; each writes a `mock-router.cordis.yml` into its temp home and passes `--patch`, replacing the `llm-pi-ai` entry's config with a single `llama-router` route at the mock's base URL (no `/v1` suffix — the mock records the raw path and asserts `/chat/completions`; pi-ai handles `reasoning_content` SSE).
- The compaction e2e's shrunk test window stays ≥ ~9216 tokens for the clamp above: a 12000 window at the 0.5 threshold, ~1800-token fixture files, and `compactionRetries: 2` for router queueing under 4-way parallel load.
- The stage exit is green: `apps/cli/tests` at 20 files / 87 tests, the `llm-pi-ai` adapter e2e at 4/4, and a `pnpm run demo:ptc` headless PTC run against the resident card.
