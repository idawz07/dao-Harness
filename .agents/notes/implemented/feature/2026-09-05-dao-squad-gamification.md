# Agent Note: Dao squad gamification (XP, levels, badges)

Status: implemented

## Problem

Dao's brand is a gamified squad, but Stage 4 only shipped specialist presets and role accent dots. Roster cards had no XP, level, or earned badges, and there was no log-derived computation that respected model-visible ⟺ logged.

## Decision

Ship `@daoai/dao-squad-progress` under `packages/session/squad-progress/`:

1. **Projection authority** — register `squadProgress` on `ctx.sessionProjections` with wire view `{ xp, level, badges }`. Fold awards from durable session events:
   - successful tool result: +1 XP
   - successful delegation tool (`subagent` / `subagent_*`): +2 XP (spawn)
   - successful foreground settle (result text is not a background/continuable start notice): +5 XP
2. **Level curve** — `level = floor(sqrt(xp / 10)) + 1`.
3. **Badge rule table** — `first_delegation`, `ten_tools`, `error_free_turn` (completed turn with no tool errors).
4. **Storage mirror** — `ctx.squadProgress` opens storage-domain `squad_progress` v0 and puts per-session rows on projection change. Storage is not the client authority.
5. **UI** — `ui-subagent` lineage rows with a resolved squad role show a compact `Lv.{n}` chip (and badge count when earned) from `summary.projectionValues.squadProgress`; absent projection keeps Stage 4 accent-only behavior. Copy is locale-owned.

Mount on `dao-base` (after storage-domain) so every surface gets the fold. Add the package to `dao-base` and `python/sdk-runtime` dependency closures.

Document-ingest +3 XP is skipped until reference puts leave a session-visible event. Portrait images, model-visible squad status prompts, and rich badge UI are deferred.

## Alternatives considered

- **Derive XP only from session-stats counters** — rejected: session-stats owns conversation wall times, not tool-success or spawn counts.
- **Storage as authority with optional projection** — rejected: violates model-visible ⟺ logged for any future model-facing surface; projection fold keeps values reconstructable from the log.
- **Reuse skill-badge for earned badges** — rejected: skill-badge is an opt-in skill catalog provider, not an earned-progress store.

## Consequences

Sessions that run tools or spawn specialists accumulate `squadProgress` in listing projections; Web roster chips render level/badges for role-prefixed children. Background/continuable starts award spawn XP only until a later settle signal is logged. Cross-session career XP is not accumulated — each session's fold is independent.

## Required verification

- `pnpm --filter @daoai/dao-squad-progress test` — level curve, badge rules, projection fold, Loader composition, storage mirror.
- `pnpm --filter @daoai/dao-client-ui-subagent exec vitest run tests/conversation-ui.client.spec.tsx tests/squad-role.client.spec.ts` — level chip when projection present; accent-only when absent.
