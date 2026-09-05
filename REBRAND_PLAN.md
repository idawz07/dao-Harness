# Dao — fork, rebrand, and product plan

Master working plan for converting this DeepSeek Harness checkout into **Dao**: a privately used,
locally powered agent system whose identity is a gamified squad — a generalist **orchestrator** that
spawns **specialist** subagents — backed by a **reference store** for documents.
This file is a working document: delete or fold it into the final Agent Note when done.
Companion working document: `PORTRAIT_PROMPTS.md` (squad art direction and text-to-image prompts).

## Confirmed decisions (2026-08-29)

| Decision | Value |
|---|---|
| Product name / identity | **Dao** — gamified: generalist orchestrator + specialist subagents |
| CLI binary | `dao` (was `dsh`) |
| npm scope / GitHub org | `@daoai` (org handle `daoAI`) |
| DeepSeek API layer | Removed entirely |
| LLM backend | Local AI, OpenAI-compatible endpoint (details = O1) |
| Distribution | Private/internal server only — not published |
| Git | New repo in `daoAI` org with full history |
| Upstream baseline | commit `cd5ef81481`, version `0.1.2-alpha.1` |
| New repo | `daoAI/dao`, private; `origin` = new repo, `upstream` = `deepseek-ai/deepseek-harness` |
| External services | Keep Codex (`subagent-codex`, `hooks-codex`) + web-search providers; drop Claude Code family and E2B |
| Gamification vocabulary | Owner-approved defaults: squad / XP / badges; roster names and accent colors per Workstream C and `PORTRAIT_PROMPTS.md` |

## Legal position (checked against repo documents)

- Repo is MIT (`LICENSE`, "Copyright (c) 2026 DeepSeek"); private modified use is fully permitted.
- "DeepSeek Harness" is a registered trademark per `BRAND_GUIDELINES.md`; renaming to Dao complies.
- **Must keep:** `LICENSE`, every `vendor/*/LICENSE`, `THIRD_PARTY_NOTICES.md` (regenerated), upstream provenance links.
- The Claude Code family (`subagent-claude-code`, `hooks-claude-code`) is deleted in Stage 3; its non-MIT payload (`SEE LICENSE IN README.md`) leaves the tree. `subagent-codex` (Apache-2.0) is kept.
- Not legal advice; re-consult if the server ever serves people outside the owner's org.

## Open items (O1–O4, O9, O10, O11 resolved 2026-08-29; O5–O8 proceed as written defaults)

| # | Item | Needed before | Recommendation |
|---|---|---|---|
| O1 | ~~Local AI details~~ **Resolved 2026-08-29, corrected 2026-09-05:** self-hosted Qwen3.8 farm — resident llama.cpp router on `100.110.212.93:8081` (8 live presets; the default) + 4 on-demand vLLM cards named per the service manager (`:8767/api/services`); one GPU model at a time | done | Stage 2 route table |
| O2 | ~~New repo~~ **Resolved:** `daoAI/dao`, private; `upstream` remote kept for future sync | done | Stage 7 |
| O3 | ~~Claude Code vs Codex~~ **Resolved:** keep `subagent-codex` + `hooks-codex`; delete the Claude Code family (non-MIT payload) | done | Stage 3 |
| O4 | ~~External services~~ **Resolved:** keep `web-search-exa`/`web-search-perplexity` (provider-neutral); delete the E2B family (`dsh-e2b`, `dsh-fs-e2b`, `dsh-subprocess-e2b`) | done | Stage 3 |
| O5 | zh docs product name: Latin "Dao" or 道? | Stage 1 | Latin "Dao" in both languages (pairing-safe); owner may override |
| O6 | Prose pass over active `.agents/notes/implemented/**`? | Stage 1 | Yes; `archived/**` frozen, never touched; owner may override |
| O7 | `BRAND_GUIDELINES.md` fate | Stage 1 | Replace with short Dao brand statement + upstream pointer; owner may override |
| O8 | Release/publish infra (npm org, `release:*`, CI publish) | Stage 7 | Keep dormant or delete; no publishing; owner may override |
| O9 | ~~Gamification vocabulary~~ **Resolved (owner approved defaults):** squad / XP / badges; roster names and accent colors per Workstream C and `PORTRAIT_PROMPTS.md` | done | Stage 6 |
| O10 | ~~RAG depth~~ **Resolved:** indexed store + model-navigable index; no vector layer for MVP — the service manager lists a BGE-M3 embedding service (`:8082`, off); revisit B2 in Stage 5 if enabled | done | Workstream B |
| O11 | ~~Initial roster~~ **Resolved (owner delegated):** Scout, Forge, Lens, Quill, Relay, Scribe — one preset dir each, editable | done | Workstream C |

---

## Workstream A — Rebrand + gamification identity

### Rename map (authoritative)

| Old | New | Notes |
|---|---|---|
| `@deepseek-ai/dsh-*` (≈200 pkgs) | `@daoai/dao-*` | e.g. `@deepseek-ai/dsh-llm` → `@daoai/dao-llm` |
| `@deepseek-ai/dsh` (CLI app) | `@daoai/dao` | bin key `dsh` → `dao` |
| `@deepseek-ai/dsh-root` | `@daoai/dao-root` | |
| `dsh-python-runtime-closure` | `dao-python-runtime-closure` | unscoped python pkg |
| `@deepseek-ai/node-addon-landlock-run*` (4) | `@daoai/node-addon-landlock-run*` | |
| `@deepseek-ai/website` | `@daoai/website` | |
| `@deepseek-ai/cordis*`, `cosmokit`, `schemastery` (vendor) | `@daoai/…` same tails | update `scripts/rescope-vendor.ts` target scope |
| `dsh` CLI references (scripts, docs, CI, `pnpm dsh`) | `dao` | |
| `DSH_*` env vars (`DSH_HOME`, `DSH_SNAPSHOT`, `DSH_BOOT__*`, `DSH_SESSION_ID`, `DSH_BUILD_FACE`, `DSH_WEB_URL`, …) | `DAO_*` | word-boundary safe |
| camelCase `dsh…` identifiers (incl. `@dshScopeScan` JSDoc tag) | `dao…` | update tag-parsing gates in the same commit |
| `deepseek-defaults.cordis.yml` fixtures | `dao-defaults.cordis.yml` | `pi-ai-defaults` stays |
| `deepseek-official` route, `DEEPSEEK_API_KEY`/`DEEPSEEK_BASE_URL` | removed | Stage 3 |
| `deepseek-v4-flash`/`deepseek-v4-pro` model ids | local model (O1) | Stage 2 |
| `dsh_session_log`, `dsh_plugin_packages` request fields | removed | with DeepSeek extension packages |
| "DeepSeek Harness" prose (docs, READMEs, website, AGENTS/CONTRIBUTING) | "Dao" | frozen surfaces exempt |
| website title / wordmark | "Dao" | new asset or text-only identity |
| `dsh-{llm-deepseek, deepseek-llm-api-extensions, plugin-package-inventory-deepseek, web-search-deepseek, session-log-deepseek}` | **deleted, not renamed** | Stage 3 |

### Frozen surfaces (never rename / never touch)

- `.agents/notes/archived/**` — frozen by note policy.
- `LICENSE` — MIT copyright line stays exactly as-is.
- `vendor/README.md` manifest, `vendor/*/LICENSE` — upstream provenance (names, SHAs, links).
- `THIRD_PARTY_NOTICES.md` upstream links (regenerate the file itself).
- Third-party product names: `subagent-claude-code`, `hooks-codex`, `web-search-exa`, `web-search-perplexity`, E2B, `@cordisjs/*` upstream names in the rescope mapping.
- `snapshots/**` expected outputs — never hand-edit; re-record (Stage 7).
- `pnpm-lock.yaml` — regenerate via `pnpm install`, never hand-edit.
- Generated catalogs (`docs/config-catalog.*`, `docs/tool-catalog.*`, cordis catalogs) — regenerate via `gen-*` scripts.

### Gamification identity (design)

Dao's brand is the squad, not a logo. Concrete model, all on existing seams:

- **The generalist** — the main agent (deployment persona + system prompt) is Dao itself: the orchestrator. Its job description (persona text) names the roster and when to delegate.
- **Specialists** — one agent preset per role (Workstream C): Scout, Forge, Lens, Quill, Relay, Scribe. Each has a persona (identity text), a filtered toolset, its skills, and a card (model route). Gamified surface = role name, title, portrait, level, badges; portrait prompts live in `PORTRAIT_PROMPTS.md`, each role's accent color doubles as its UI token.
- **XP & levels** — computed from session events (`session-stats`/`session-telemetry`): tasks completed, tool successes, children spawned and settled, reference documents ingested. Per-agent and overall level; stored in a `storage-domain` unit; exposed by a projection for UI. Invariant respected: every gamified value is derivable from the session log (repo rule: model-visible ⟺ logged — gamification values shown to the model must be session-visible).
- **Badges** — a declarative rule table over session events (first delegation, 10 tasks, error-free run, …). `skill-badge` is the existing precedent for badge delivery; UI renders earned badges.
- **Roster UI** — specialist cards (name, title, live state, level, badges) extending the existing `ui-subagent`/`ui-trajectory` surfaces.

---

## Workstream B — Reference store (documents & RAG)

Goal: a way to store documents/references as information the agent can retrieve.

Existing seams to build on:
- `ctx.storageDomain` (`storage` group: schema-validated domains, JSON/SQLite backends, change events) — the durable home for a reference index.
- `tool-fs-search` (ripgrep-based) — already a strong raw retrieval primitive.
- `file-reference`/`file-reference-local` — `@path` completion grammar for UIs; reuse the mention pattern for `@doc`.
- `web` capability (fetch/search providers) — ingest remote references.
- `session-query` (SQLite-backed) — query past sessions as a reference source.
- `mcp-memory` examples (`engram`, `memorix`) — the external-memory-server pattern; rejected for MVP in favor of the internal storage domain (local-only posture, no external service).

Design:
- **B1 — Document store (MVP, no vectors).** New `references` capability: a `storage-domain` document unit `{id, title, source (path|url), ingestedAt, chunks[{text, hash}]}`. Model-facing tools: `reference-add` (file path or URL → chunk → store; URLs via the web fetch provider), `reference-search` (keyword-scored chunk retrieval, top-k), `reference-get` (full chunk/document), `reference-list`/`reference-remove`. Ingest chunks at ~500 tokens with overlap. UI: `@doc` completion via the file-reference pattern.
- **B1b — Navigation.** The store keeps a browsable index (source → document → chunk manifest) exposed to the model as a `reference-index` view, so the LLM can navigate the corpus without a query string; `@doc` completion in the UI mirrors the same tree.
- **B2 — Vectors: deferred.** The farm serves no `/v1/embeddings`; retrieval is indexed + navigable (B1/B1b). Revisit only if an embeddings endpoint appears.
- **B3 — Session references.** Surface `session-query` results inside the reference UI so prior sessions are browsable references, not just a tool.
- New tool UI presentation designed up front (repo rule): host presenters pure, web cards derived from raw events + persisted result metadata.

---

## Workstream C — Orchestrator + specialist subagents

Goal: the generalist orchestrator spawns specialists that do something else (research, review, writing, ops), then integrates their results.

Existing seams (all verified in-tree):
- `ctx.subagents` delegation service — one-shot runs, continuable children, discovery; providers: in-process spawn/fork, `dsh-sdk` out-of-process, ACP/Codex/Claude Code.
- Spawn request already carries **per-child `persona`** (shadows the deployment persona for that child), `toolFilter`, model/provider/reasoning overrides, depth, output schema — the specialist identity hooks exist natively.
- Model-facing tools: `tool-subagent` (delegate), `tool-subagent-control` (follow-up/interrupt/list), `tool-subagent-report` (child→parent channel).
- `ctx.workflowEngine` + `tool-workflow` — model-authored orchestration scripts fanning out many subagents; `tool-ralph` — fresh-agent iterative loops.
- `ctx.agentPresets` — preset roster (dirs with `agent.cordis.yml`), discovery over deployment + user roots, copy-only authoring; `persona` package = composable identity row.

Design:
- **C1 — Specialist presets.** Author a Dao preset root, one directory per role. Final roster (owner delegated; each role is one editable `agent.cordis.yml` = persona + filtered tools + skills + card):
  - `scout` — the research specialist. Web fetch/search + fs read, no writes; 262K card; skill: source-citation method.
  - `forge` — the engineering specialist. Full coding toolset (standard base); default card; skill: repo conventions.
  - `lens` — the review specialist. Read-only tools + session-query; default card; skill: review checklist.
  - `quill` — the documentation specialist. fs read/write scoped to doc paths; default card; skill: doc conventions.
  - `relay` — the ops specialist. shell + subprocess, narrow approval surface; default card.
  - `scribe` — the knowledge keeper. Reference-store tools (Workstream B) + fs read; organizes/ingests/declutters the corpus; default card.
  Card = the model route a spawn request assigns via the native model/provider override field.
- **C2 — Orchestrator wiring.** The main agent keeps `tool-subagent` + `tool-subagent-control` + `tool-workflow`; add a delegation-playbook skill (or prompt section) that names each specialist, when to spawn which, and how to fill the spawn request (`persona` = role identity, `label` = role name for UI, `toolFilter` = the role's tools). Delegation stays model-judgment (repo rule: plugins, not loop changes); the playbook guides, the model decides. Fan-out work uses `tool-workflow` (scout/worker/reviewer tiers map to the roster).
- **C3 — Roster UI.** Extend `ui-subagent`/`ui-trajectory` with specialist cards (role, level, live state); live status from the existing subagent discovery + descriptor data.
- **C4 — Reports & integration.** Children report through `tool-subagent-report`; the orchestrator integrates reports into its own turn. Continuable children let the orchestrator follow up with the same specialist across turns.

---

## Stages (execution order)

Each stage ends green on its exit gates before the next starts. All work on branch `rebrand/dao`.

### Stage 1 — Rename + docs (mechanical, the core lift)

**Status: complete 2026-08-29** — all exit gates green (build, typecheck, lint, doc-sync 32/32,
test:docs, website:build); `rg '@deepseek-ai'` outside frozen surfaces is empty. See the execution
log below for judgment calls the plan did not anticipate.

1. Branch `rebrand/dao`; record baseline (`cd5ef81481`, `0.1.2-alpha.1`).
2. Author `scripts/rebrand-dao.ts` (pattern: `scripts/rescope-vendor.ts`): explicit mapping table, `--report`, `--apply`, `:check`.
   Coverage: all 272 `package.json` names + dependency keys + `bin`/`files`/`exports`/scripts; `tsconfig.base.json` paths (516 refs); import specifiers (`import`, `import type`, `declare module`, `require(`, dynamic `import()`); `*.cordis.yml`/`*.patch.yml`/`*.snapshot.yml` plugin names; `DSH_*`→`DAO_*`; camelCase `dsh…`→`dao…` incl. `@dshScopeScan` tag + its parsing gate; root scripts, `.github/workflows`, shell scripts.
   Exclusions: the frozen list.
3. `pnpm install` (lockfile), update `rescope-vendor.ts` target scope to `@daoai`.
4. Prose pass: "DeepSeek Harness" → "Dao" across `README*`, `docs/**`, `website/**`, `AGENTS.md`, `CONTRIBUTING*`, package READMEs (en+zh together), `.i18n.yaml` pairs (`verify-translation-pairing --write`), website title/`siteIdentity`, `BRAND_GUIDELINES.md` (O7), active agent notes (O6).
5. Regenerate catalogs: `pnpm run doc-sync`; `pnpm run website:build`.
- **Exit:** `build`, `typecheck`, `lint`, `doc-sync`, `test:docs`, `website:build` green; `rg '@deepseek-ai'` (non-frozen) empty.

### Stage 2 — Local provider (Qwen3.8 farm + llama-router, resolved)

Route names and context windows verified 2026-09-05 against the tailscale service manager (`http://100.110.212.93:8767/api/services` and `/api/llm-router/models`) and the live router (`:8081/v1/models`). The farm loads one GPU model at a time: the llama.cpp router is the resident systemd card (loads presets on demand), and the vLLM cards are started on demand through the service manager for workloads that need them (262K context, 8 active sequences).

1. Sole LLM adapter = `llm-pi-ai` with five hand-declared routes, all `api: openai-completions`, auth from the pi auth store (or `apiKeyEnv`):
   - `llama-router` (`http://100.110.212.93:8081/v1`, resident card; snapshot re-syncs when `router-presets.ini` changes):
     | Model id (router alias) | Per-slot ctx | Reasoning | Image |
     |---|---|---|---|
     | `Qwen3.8-27B-Q6_K_XL-128K` (default) | 131K | yes | — |
     | `Qwen3.8-27B-Q6_K_XL-128K-NoThink` | 131K | no | yes |
     | `Qwen3.8-27B-Q4_K_XL-128K-Vision` | 131K | yes | yes |
     | `Qwen3.8-27B-AD-Q5_K_M-256K-P1-Vision` | 196K | yes | yes |
     | `Qwen3.8-27B-AD-Q5_K_M-256K-P2-Vision` | 131K (262K / 2) | yes | yes |
     | `Ornith-1.0-35B` | 131K (262K / 2) | no | yes |
     | `Gemma4-12B-Unified` | 32K | no | yes (+audio) |
     | `Gemma4-E2B-Uncensored-HauhauCS-Aggressive` | 32K (128K / 4) | yes | — |
     Per-slot ctx = `--ctx-size` / `--parallel`; Qwen-family thinking uses `thinkingFormat: qwen-chat-template` with `chatTemplateKwargs: { preserve_thinking: true }` (same as the pi extension).
   - On-demand vLLM cards (route = service-manager key):
     | Route | Endpoint | Model id | Context | Role |
     |---|---|---|---|---|
     | `qwen38_quasar_262k` | `100.110.212.93:18081/v1` | `qwen38-quasar-nvfp4` | 262K | heavy fan-out; 8 active sequences, prefix caching |
     | `qwen38_cyanwiki_192k` | `100.110.212.93:18080/v1` | `qwen38-cyanwiki-awq-g32` | 192K | quality-first AWQ card (G32 W4A16, MTP-2) |
     | `qwen38_unsloth_nvfp4_131k` | `100.110.212.93:18082/v1` | `qwen38-unsloth-nvfp4` | 131K | alternate (vision + tools) |
     | `qwen38_ninfer_nvfp4full_262k` | `100.110.212.93:18083/v1` | `qwen38-ninfer-nvfp4full` | 262K | long-context card (Scout, heavy RAG turns; vision overlay) |
   Carry each vLLM route's `compat` block (`thinkingFormat: qwen`, `supportsDeveloperRole`, …) from the pi catalog. The cards were down at verification time; confirm each served model id from the card's `/v1/models` when it is first started.
2. Point `agent-default-model` + profile defaults (`apps/cli/config/**`, preset `agent.cordis.yml`) at `llama-router`/`Qwen3.8-27B-Q6_K_XL-128K`, thinking `high` (pi's current interactive default; the resident card is always available).
3. Specialist card routing: a spawn request's model/provider override assigns the long-context card (`qwen38_ninfer_nvfp4full_262k`) to Scout when that card is up (Workstream C); otherwise the router's 196K/131K cards carry long turns.
4. e2e self-skip: skip when the router (`:8081`) is unreachable (mirror today's key-based self-skip); vLLM-card tests run only when the owner has started the card.
- **Exit:** `pnpm run demo:ptc "task"` completes headless against the resident card.

## Stage 2 execution log (judgment calls beyond the plan text)

- **Env var names**: farm keys are `LLAMA_ROUTER_API_KEY`, `QWEN38_QUASAR_API_KEY`, `QWEN38_CYANWIKI_API_KEY`, `QWEN38_UNSLOTH_API_KEY`, `QWEN38_NINFER_API_KEY` (real router key in root `.env`, gitignored; the four vLLM keys are placeholders until first card start). `DAO_*` is unusable: `BOOTSTRAP_PREFIXES` in `packages/boot/app-boot/src/index.ts` rejects `DAO_`-prefixed values from `.env` at boot.
- **Route keys are lowercase-hyphen** (`llama-router`, `qwen38-quasar-262k`, …), not the plan's underscored service-manager keys; credential ref grammar allows alnum/underscore, and lowercase-hyphen route keys match the pi catalog convention already used for `deepseek-official`.
- **ACP test profile broke its symlink**: `apps/cli/tests/profiles/acp/cordis.yml` is now a standalone file (farm `llm-pi-ai` block + `acp` row at `llama-router`/`Qwen3.8-27B-Q6_K_XL-128K`, all original tail entries preserved).
- **`acp-app` bundle row moved too**: `packages/bundle/acp-app/cordis.patch.yml` session row is `llama-router`/`Qwen3.8-27B-Q6_K_XL-128K` (spec + README en/zh updated); the plan's item-2 "profile defaults" covers it.
- **`demo:ptc` takes no `--`**: the script joins `process.argv.slice(2)`, so `--` lands inside the task string and the CLI rejects it as an unknown option. Invoke `pnpm run demo:ptc "task"`.
- **e2e gate**: `vitest.e2e.config.ts` probes `100.110.212.93:8081` (spawnSync TCP, 3 s timeout, 5 s cap) and freezes `DAO_FARM_REACHABLE` for the whole run; real-model suites gate on it via `describe.skipIf`/`hasKey` swaps. The root `.env` is loaded in the same config so `LLAMA_ROUTER_API_KEY` reaches in-process harnesses and subprocess env spreads.
- **apps/cli product e2e converted** (gate + route): `harness.ts` now mounts `CredentialsLocal` + `LlmPiAi` and exports `ROUTE`/`MODEL` (consumers create agents with `{ provider: ROUTE, model: MODEL }`); `ptc.e2e.ts` same; ACP tests inject `LLAMA_ROUTER_API_KEY`; `team-llm.mjs` registers `['llama-router']`; `agent-team-headless.e2e.ts` disables `llm-pi-ai` and sets `LLAMA_ROUTER_API_KEY: ''`; `headless-shutdown.e2e.ts` drops its unused dummy key; `github-webhook-real` gate-only (`...process.env` already carries the key).
- **`built-bin.e2e.ts` mock tests**: the headless and ACP mock-backed tests run the *shipped* profiles, whose default route is now `llama-router`; each writes a `mock-router.cordis.yml` into its temp home and passes `--patch`, replacing the `llm-pi-ai` entry's config with a single `llama-router` route at the mock's base URL (no `/v1` suffix — the mock records the raw path and the test asserts `/chat/completions`; pi-ai handles `reasoning_content` SSE). Key flows via `LLAMA_ROUTER_API_KEY`. The ACP mock test and the environment-probe test's direct `deepseek-official` stream call keep working through the still-mounted `llm-deepseek` row + `DEEPSEEK_BASE_URL` (Stage 3 removes both).
- **SDK `keyless-smoke.e2e.ts` unchanged**: it explicitly initializes `deepseek-official`/`deepseek-v4-pro` against a local mock via `DEEPSEEK_BASE_URL`; it exercises the SDK protocol, not the default route. Stage 3 decides its fate.
- **pi-ai `clampMaxTokensToContext` finding**: pi-ai clamps the wire `max_tokens` to `contextWindow − estimated input − 4096` (`simple-options.js`). Any test that shrinks a model's advertised `contextWindow` below `input + 4096 + usable output` silently degenerates to `max_tokens: 1` (one-token output, `length` stop). The compaction e2e is tuned around this: 12000 test window (0.5 threshold = 6000), ~1800-token fixture files, `compactionRetries: 2` for router queueing under 4-way parallel e2e load. Keep the window ≥ ~9216 when touching it.
- **`assemble.ts` test helper**: `packages/llm/llm-pi-ai/tests/assemble.ts` defaults `provider: 'deepseek'`; farm e2e calls pass the route explicitly.
- **Known-deferred breaks** (owner-approved): `*.expected.e2e.ts` + `test:snapshot` still expect deepseek wording (excluded from `test:e2e`; re-record at Stage 7); 7+ `.cordis.snapshot.yml` files reference deepseek (Stage 7); `base/cordis.patch.yml` keeps the `llm-deepseek` row and the `web-search` `searchProvider: deepseek-official` (Stage 3); package-level DeepSeek e2e (`llm-deepseek`, web-search, subagent real-deepseek) stay key-gated until Stage 3.
- **Green at handover**: `apps/cli/tests` under `vitest.e2e.config.ts` → 20 files / 87 tests pass (compaction flakes once per ~3 sweeps under 4-parallel farm load; passes in isolation and with `retry: 2`); `packages/llm/llm-pi-ai/tests/adapter.e2e.ts` → 4/4; `pnpm run demo:ptc` exit gate passed (real-model PTC task, reasoning + answer).
- **Closeout 2026-09-05** (fresh session, Stage 2 commit): `harness.ts` typecheck fix (`farmModel` extraction — `farmProfile.models[0]!` is brittle after the profile refactor); Stage 1 gap repair — the codemod's `snapshots/` exclusion also froze live harness code, so the five harness files' old-name import specifiers were renamed (`@deepseek-ai/dsh-*` → `@daoai/dao-*`, incl. `@deepseek-ai/cordis` → `@daoai/cordis`); no recorded data, yml, env pair, or expected output touched (harness↔yml `DSH_*` env pairs and all `DAO_*`-vs-`DSH_*` splits stay coupled for the Stage 7 re-record); unused `@daoai/dao-llm-deepseek` devDep removed from `llm-pi-ai` (knip) + stale package `description` aligned to the README; `acp-app` README en/zh pair re-recorded (Stage 2 edited both sides but never `--write`); `apps/cli/composition.md` graph regenerated (farm model rows) and the generator's `dsh_base` node-id prefix corrected to `dao_base`; Agent Note `implemented/architecture/2026-08-29-local-llama-router-farm-default-route` written + recorded; snake_case `dsh_` residue audited (see Stage 1 log amendment above).

### Stage 3 — Remove the DeepSeek API layer

1. Delete packages: `llm-deepseek`, `deepseek-llm-api-extensions`, `plugin-package-inventory-deepseek`, `web-search-deepseek`, `session-log-deepseek` (+ READMEs/i18n/tests/catalogs).
2. Strip DeepSeek request-metadata ownership from `llm` core (`dsh_session_log`, `dsh_plugin_packages`, `ctx.deepseekLlmApiExtensions`); keep the provider-neutral contract.
3. Remove `deepseek-official` route wiring, `DEEPSEEK_*` env, `deepseek-defaults` fixtures; keep `pi-ai-defaults`.
4. Delete the Claude Code family (`subagent-claude-code`, `hooks-claude-code`) and the E2B family (`dsh-e2b`, `dsh-fs-e2b`, `dsh-subprocess-e2b`) (+ CI secret usage); keep `subagent-codex` + `hooks-codex` and the web-search providers (O3/O4 resolutions).
5. `llm-mock-server`: keep as generic test double, strip DeepSeek wire specifics.
- **Exit:** `build`, unit `test` green; `rg -i deepseek` (non-frozen, non-provenance) empty.

### Stage 4 — Specialists + orchestrator (Workstream C)

1. C1: author the six specialist presets in the Dao preset root (final roster in Workstream C).
2. C2: delegation-playbook skill/prompt section on the orchestrator preset; verify spawn requests carry persona/toolFilter/label (existing contract — no service change expected; if a gap appears, it is a capability addition with its own note).
3. C3: roster UI on top of `ui-subagent`/`ui-trajectory`.
4. Smoke: orchestrator delegates a research task to the researcher, follows up, integrates the report.
- **Exit:** e2e test for orchestrated delegation passes against the local model; new tool/UI surfaces follow the tool-UI design rule; Agent Note written.

### Stage 5 — Reference store (Workstream B)

1. B1: `references` storage domain + `reference-add`/`reference-search`/`reference-get`/`reference-list`/`reference-remove` tools + `@doc` completion; chunking + keyword scoring.
2. B1b: `reference-index` navigation view + `@doc` completion.
3. B3: session-query surface in the reference UI.
4. Design tool UI presentation up front; plan unit/e2e/snapshot coverage per the testing policy.
- **Exit:** e2e: ingest a doc, retrieve by keyword, answer a question from it; snapshot of a reference-using session recorded.

### Stage 6 — Gamification layer (Workstream A-gamify)

1. XP/level computation from session events (stats/telemetry) → storage domain → projection.
2. Badge rule table + earned-badge delivery (skill-badge precedent).
3. Roster cards gain level/badges (C3 surface).
4. Gamification vocabulary per the O9 resolution (squad/XP/badges defaults; roster names and accent colors in Workstream C and `PORTRAIT_PROMPTS.md`); UI copy through locale-owned typed dictionaries, no hardcoded strings.
- **Exit:** session that spawns a specialist shows XP/badge changes; all gamified values log-derivable; Agent Note.

### Stage 7 — Re-record, full gates, new repo

1. `pnpm run test:snapshot:record` (317 snapshot files reference the old route/model) → `pnpm run test:snapshot`; `pnpm run test:expected` (refresh where model output changed; fix fixtures, not normalizers).
2. Full local suite (repo-wide change → rehearse everything): `install, build, typecheck, lint, test, test:coverage, test:expected, test:snapshot, doc-sync, hygiene, duplication, website:build`.
3. Rebrand + feature Agent Notes (repo rule: non-trivial change requires a note in the same change).
4. Create private repo `daoAI/dao` (O2), push full history; remotes: `origin` → `daoAI/dao`, `upstream` → `deepseek-ai/deepseek-harness`.
5. Delete this plan file (or fold into the notes), close todos.
- **Exit:** Stage 7.2 green; new repo serves the renamed, locally powered, squad-branded product.

## Risk register

| Risk | Mitigation |
|---|---|
| Blind-rename hits frozen surfaces (archived notes, LICENSE, vendor provenance) | Script exclusion list + `:check` mode + post-sweep `rg` audit |
| Bilingual pairing gate failures | Edit en/zh/yaml in one pass; `verify-translation-pairing --write` |
| Hand-edited generated files drift | Never hand-edit; regenerate catalogs/notices/lockfile |
| Snapshot re-record divergence (local model ≠ recorded model) | Re-record once, at Stage 7, after features land; pin model + temperature, document in note |
| Per-file 100% coverage gate vs deleted DeepSeek files | `test:coverage` at each stage exit; deleted packages leave no orphan coverage |
| `@dshScopeScan` tag rename breaks doc gates | Tag + parsing gate renamed in the same commit |
| Gamification violates "model-visible ⟺ logged" | XP/badges computed from session events; anything shown to the model is a logged projection |
| Specialist presets collide with host-plane composition (realm rules) | Preset files follow `standard/agent.cordis.yml` conventions (isolate realms, host-owned registries); mount validation rejects collisions at load |

## Stage 1 execution log (judgment calls beyond the plan text)

- **Codemod**: `scripts/rebrand-dao.ts` (report/apply/check modes, explicit rule table, postconditions).
  Rules: scoped names (longest-first), `DSH_`→`DAO_`, word `DSH`, camel `dsh…`, pascal `Dsh…`, bare
  `\bdsh\b`, "DeepSeek Harness" prose; renames via separate `git mv`; frozen-surface `excluded()` list.
- **Python layer renamed in Stage 1** (plan silent; pre-release stance): modules `deepseek_harness`
  → `dao`, `deepseek_harness_runtime` → `dao_runtime`; dists `deepseek-harness-sdk`/`-runtime-bin`
  → `dao-sdk`/`dao-runtime-bin`; ACP agent name `dao-acp`; `uv.lock` regenerated.
- **Generated catalogs**: the anchor ids (`<a id="…">`, from `githubSlug(@scope/pkg)`) live in the
  generated catalogs; codemod carries a `catalog-anchors` rule (regex + function replacement mirroring
  `githubSlug` from `verify-md-links.ts`) so md anchors, html anchors, and cross-links move together.
  Catalogs then regenerated via the `gen-*` family + `doc-sync`.
- **Translation twins**: `verify-translation-pairing --write --all` re-records pairing after any
  en/zh divergence. Generated-doc zh twins (`config-catalog.zh.md`, `tool-catalog.zh.md`, …) keep
  machine lines (anchors, code blocks) synced from the en side; a stale `tool-package-map` section in
  `tool-catalog.zh.md` remains (pre-rebrand drift, not rebrand-caused).
- **Archived-note references**: references in active docs to frozen `archived/**` filenames restore
  the archived filename (codemod rule), so links keep resolving.
- **Spec + build-script stragglers**: `project-doc-site.spec.ts` asserted a raw `<a id>` line (no `#`,
  outside the anchor rule's reach) — updated to the new slug. `tsdown.client.ts` CSS virtual-module
  prefixes `\0dsh-*-css:` (no word boundary after `\0`) are now `\0dao-*-css:`; codemod carries rules
  + postconditions for both surfaces. `skill-row.client.spec.tsx` accessible name now
  `Skilldao-manage-issues` (concatenated `Skill` + renamed fixture, no separator).
- **Machine-local lefthook state** (not repo content): `.git/dao-hooks` + marker + `core.hooksPath`
  updated so `pnpm install` hooks stay clean.
- **BRAND_GUIDELINES pair** excluded from the residue scan by design: it names the upstream provenance
  (short Dao statement + pointer to the DeepSeek Harness upstream).
- Remaining `@deepseek-ai`/`dsh` tokens outside frozen surfaces live only in `REBRAND_PLAN.md`
  (this untracked working doc) and `scripts/rebrand-dao.ts` (the mapping table itself). **Amended
  2026-09-05** (Stage 2 closeout audit): that claim covered the codemod's word-boundary rules only;
  snake_case `dsh_` tokens it cannot reach remain: the Python SDK's public `dsh_bin`/`dsh_home`
  config fields (`python/sdk/src/dao/{api,client}.py`, tests, examples, `development.md`,
  `docs/user/guide/python-sdk.*`), the code-runtime reserved slot `__dsh_main__` (a Python-backend
  bootstrap token; the Python runtime is not in this repo, so the rename must move with it),
  E2B shell-local `dsh_e2b_*` variables (`subprocess-e2b`, deleted at Stage 3), and the
  `dsh_session_log`/`dsh_plugin_packages` wire fields (already owned by Stage 3). Disposition:
  Stage 3 owns the Python API rename + `__dsh_main__` alongside the DeepSeek-layer removal.

## Resume checklist (fresh session)

1. Read this file; the Stage 2 execution log above is the authoritative record of implementation decisions.
2. `git status` (expect `rebrand/dao`; Stage 1 committed as `a7491efecb`, Stage 2 uncommitted).
3. `todo list` — todos map 1:1 to stages/workstreams; TODO-8c7f4e04 carries the Stage 2 handover (remaining checks, Agent Note, commit).
4. All open items resolved (O1–O4, O9–O11); O5–O8 proceed as written defaults unless the owner overrides.
5. Continue the first failing stage's next open step; do not skip exit gates.
