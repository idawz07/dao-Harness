# Agent Note: Dao specialist squad presets and orchestrator delegation

Status: implemented

## Problem

Dao's product identity is a gamified squad: a generalist orchestrator that delegates to named specialists (Scout, Forge, Lens, Quill, Relay, Scribe). The harness already had agent presets, spawn-time `persona` / `toolFilter` / `label`, and subagent UI lineage — but no shipped roster, no orchestrator playbook, and no role identity in the Web roster surface.

The model-facing `subagent` tool does not accept per-call `persona` or `toolFilter` arguments. Children also inherit the parent's preset composition rather than selecting a specialist preset at spawn time. A plan that assumed the model would fill those fields on each spawn would not work on the current contract.

## Decision

Ship six specialist presets under `packages/preset/agent-presets/presets/{scout,forge,lens,quill,relay,scribe}/` (persona, filtered tool rows, role skill, `preset.yml` metadata). Direct sessions can select a specialist from the roster.

Treat `standard` (and the `ptc` / `cordis` copies of its delegation block) as the orchestrator:

1. Persona names the roster and points at the `delegation-playbook` skill.
2. Six additional `@daoai/dao-tool-subagent` rows (`subagent_scout` … `subagent_scribe`) fix each role's `persona`, `toolFilter`, and `maxDepth: 0`. The model chooses the tool by name; `description` becomes the UI label.
3. Keep generic `subagent` / `subagent_fork` for ad-hoc roles.

Web lineage maps role-prefixed labels to accent dots (PORTRAIT_PROMPTS.md colors). Stage 6 adds XP/level/badge chips from the `squadProgress` projection ([dao-squad-gamification](2026-09-05-dao-squad-gamification.md)); portraits remain deferred.

`lens` is the one shipped preset that mounts `@daoai/dao-tool-session-query` (see [session-search-not-shipped-default](2026-08-02-session-search-not-shipped-default.md)). Orchestrator-spawned Lens children stay on a read-only filesystem allow-list because the parent `standard` catalog does not carry session-query tools. Scribe mounts the Stage 5 reference store (`@daoai/dao-references` + `@daoai/dao-tool-references`); see [dao-reference-store](2026-09-05-dao-reference-store.md).

Allow-list `toolFilter` removes parent globals from the child view; Agent-scoped tools the joined preset reinstalls after restrict (notably delegation tools) can still appear. Specialist rows set `maxDepth: 0` so those tools cannot start nested children.

Stage 5 ships the reference store on the **Scribe preset** only. Orchestrator-spawned Scribe children keep a read-only filesystem allow-list (same Lens/session-query pattern) because `standard` does not mount `@daoai/dao-tool-references`.

## Alternatives considered

- **Expose `persona` / `toolFilter` / `agentPreset` on the model tool schema** — rejected for Stage 4: larger capability change; the named-tool Config approach reuses the existing contract and keeps filters deployment-authored.
- **Spawn-time `agentPreset` so children mount Scout's standing composition** — deferred; inheritance plus toolFilter covers MVP without a new child-join path.
- **Only specialist presets, no named orchestrator tools** — rejected: selecting Scout as the top-level session does not teach the default agent when to delegate.

## Consequences

Shipped preset and Web tool-catalog pins expand by the six specialist tools and six specialist presets. Specialist presets that mount `tool-fs` still register write/edit; read-only enforcement for Scout/Lens/Scribe is persona guidance on direct sessions and `toolFilter` on orchestrator-spawned children. Scout's optional 262K card is not hard-wired; children inherit the parent's route until a live long-context card is assigned via settings or a later card-routing change.

## Required verification

- `apps/cli/tests/web-agent-presets.e2e.ts` — shipped roster ids, `standard` catalog includes specialist tools, Scout preset composition, Scout child toolFilter + persona.
- `apps/web/tests/shipped-composition.e2e.ts` — expected tool catalog includes the six specialist names.
- `packages/preset/agent-presets/tests/shipped-root.spec.ts` — shipped root lists all ten presets.
- `packages/client/ui-subagent/tests/squad-role.client.spec.ts` — label → role mapping.
