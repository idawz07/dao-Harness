# Dao rebrand — Stages 4–6 COMPLETE; Stage 7 PAUSED (2026-09-05)

Working handoff on branch `rebrand/dao`. **Paused by owner** mid Stage 7.

## Stages 4–6 (verified)

| Stage | Status | Evidence |
|---|---|---|
| 4 Specialists | **complete** | Scout/catalog e2e; Agent Note `2026-09-05-dao-specialist-squad-presets` |
| 5 Reference store | **complete (MVP)** | `packages/references/*` tests 11/11; Scribe mount; `@doc` UI deferred |
| 6 Gamification | **complete (MVP)** | `packages/session/squad-progress` + ui-subagent chips; tests 9/9 |

## Stage 7 progress (paused)

### Done since last handoff
- `repository.url` → `daoAI/dao`; constraint scripts updated
- Product `__dsh_*` → `__dao_*`; lefthook marker → Dao owner string
- Snapshot **inputs** cleaned: `DSH_*`→`DAO_*`, `dshHomePath`→`daoHomePath`, deleted `llm-deepseek` / Claude Code hook rows, `hook-cc-*` scenarios removed, `subagent-dsh-sdk-*`→`subagent-dao-sdk-*`, live record route remaps `deepseek-official`→`llama-router`
- `text-turn` SDK + headless **record smoke passed** (source CLI)
- Host+client `build:lib` green after fixing Stage 5/6 test TS errors; `apps/cli/lib` + `squad-progress/lib` present
- `gh` installed via Homebrew (**not logged in**)

### In flight when paused
- Full `DAO_SNAPSHOT=record vitest … --update` was running; SDK suite already showed 4 failures (`persistent-tools` timeout, several subagent scenarios). Process stopped for pause — inspect `/tmp/dao-snapshot-record.log` and working-tree golden diffs before re-record.

### Still required to exit Stage 7
1. Finish/fix full snapshot re-record → green `test:snapshot` (+ `test:expected` where needed).
2. Full gate suite: install, build (web currently fails: missing `nanoid/non-secure` under postcss), typecheck, lint, test, test:coverage, test:expected, test:snapshot, doc-sync, hygiene, duplication, website:build.
3. `gh auth login`, then create private `daoAI/dao` and flip remotes (`origin`→new, `upstream`→`deepseek-ai/deepseek-harness`).
4. Fold/delete `REBRAND_PLAN.md` / this handoff / dispose `PORTRAIT_PROMPTS.md` on Stage 7 exit.

## KEEP
- pi-ai `thinkingFormat: 'deepseek'`
- experimental `BUILTIN_PROVIDER_IDS` `deepseek` where present
- Frozen `archived/**`, LICENSE, vendor provenance

## Resume
Say `/goal` resume (or continue Stage 7) on this branch; start by reaping stale vitest, then either re-run full record or triage the four known SDK failures first.
