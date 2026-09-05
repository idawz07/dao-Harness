---
description: "Squad XP, level, and badge projection with a durable storage-domain mirror for developers composing gamified roster progress."
kind: "package-reference"
---

# @daoai/dao-squad-progress

## Summary

`dao-squad-progress` folds session events into per-session squad XP, level, and earned badges as the `squadProgress` projection unit, and mirrors each wire view into the `squad_progress` storage-domain table. Clients read `{ xp, level, badges }` from the projection registry; Host code can also call `ctx.squadProgress.get(sessionId)` for the last mirrored row. Choose it in compositions that already mount the projection registry and storage-domain form (the base bundle mounts both). Document ingestion XP is deferred until reference puts leave a session-visible event.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount beside the session store, projection registry, and storage-domain form when roster UI or Host code should read session-scoped squad progress.

### Composition

```yaml
- name: '@daoai/dao-session'
- name: '@daoai/dao-session-projection'
- name: '@daoai/dao-storage'
- name: '@daoai/dao-storage-json'
  config:
    root: !!js daoHomePath('storages')
- name: '@daoai/dao-storage-domain'
  config:
    backend: json
- name: '@daoai/dao-squad-progress'
```

### XP awards and level curve

| Event | XP |
|---|---|
| Successful tool result | +1 |
| Successful delegation tool (`subagent` / `subagent_*`) | +2 (spawn) |
| Successful foreground delegation settle (not a background/continuable start notice) | +5 |

Level: `floor(sqrt(xp / 10)) + 1`. Badges: `first_delegation`, `ten_tools`, `error_free_turn` (a completed turn with no tool errors).

### Failures and recovery

Without the projection registry or storage-domain form the fiber stays pending. Unmounting removes the projection key and closes the domain. Restart rebuilds progress by folding the durable log; the storage table is a mirror, not an authority.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Design concept

The projection is the log-derived authority (model-visible ⟺ logged). Storage receives the same schema-validated wire view on each change-feed emission so Host tooling can inspect progress without re-folding. Delegation tools are detected by name; background starts are detected from the rendered tool-result text prefixes owned by `dao-tool-subagent`.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | `SquadProgress` service: projection registration, storage mirror, `get` |
| [`src/projection.ts`](src/projection.ts) | Projection unit definition |
| [`src/progress.ts`](src/progress.ts) | XP awards and turn helpers |
| [`src/badges.ts`](src/badges.ts) | Declarative badge rule table |
| [`src/level.ts`](src/level.ts) | Level curve |
| [`src/spec.ts`](src/spec.ts) | `squad_progress` domain declaration |
| [`src/types.ts`](src/types.ts) | Wire types and projection-map merge |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Session projection subsystem](../../../docs/subsystems/session-projection.md) — registry drive and snapshot contract.
- [Session package map](../README.md) — adjacent persistence and projection packages.
- [Stage 6 Agent Note](../../../.agents/notes/implemented/feature/2026-09-05-dao-squad-gamification.md) — XP curve, badges, and deferred work.

-----

<a id="model-experience"></a>
## Model Experience

None, as the squadProgress unit folds already-logged tool and turn events into a client-facing read model and registers nothing model-facing.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Document-ingest XP is deferred** — reference-store puts do not append a session event yet, so +3 XP for ingested documents is skipped until a log-visible signal exists.
- **Background settle XP is best-effort** — a continuable/background start awards spawn XP only; a later job-completion notice is not folded as settle XP in this MVP.
- **Storage is a mirror** — cold roster UIs that only read storage without a live fold can show a stale row until the session is opened and projections rebuild.
- **Portrait images and model-visible squad status** — deferred to later Stage 6 follow-ups; this package serves projection + storage only.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
