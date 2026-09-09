---
description: "Squad progress UI owner for the dao web client: the session-header and sidebar XP/level chips, the keyed squad details surface, and the achievement toast. Reads the durable squadProgress projection only."
kind: "package-reference"
---

# @daoai/dao-client-ui-squad-progress

## Summary

`dao-client-ui-squad-progress` is the web client owner for the squad gamification surface. It registers four slots: a level/XP pill in the session header, a compact squad status in the sidebar footer, a keyed right-column details surface (rank, next-level progress, member roster, achievements, and the XP rules), and a shell-overlay toast that announces a newly earned badge. Every value it shows comes from the durable `squadProgress` projection or the session list — the package never invents progress data. The plugin has a no-op Host half and registers an empty invariant.

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

The package ships as a Web composition plugin; no consumer wires it by hand. When it is present in the composition, the session header shows a level/XP pill, the sidebar footer shows a squad row, and the details column can open on the `squad` surface.

### Header and sidebar chips

The header pill and the sidebar row both read the current session's `squadProgress` projection through the session standard kit and render nothing when the capability is absent. The header pill shows the level and a thin progress track to the next level; the sidebar row shows a glyph, the member count, and the current rank. Either opens the details surface on the `squad` key through the layout service.

### Details surface

The details view is a keyed entry on `conversation.details.view` under the `squad` key. It shows the rank and next-level progress for the current session, the roster of that session's direct subagent children (activity, label, and each member's own level), the earned badges, and the XP rules. It renders its own header and close control because the keyed entry replaces the default details panel wholesale. An absent projection renders the empty state.

### Achievement toast

The shell-overlay entry watches the current session's badges. The first sighting of a session baselines its earned badges silently; a badge added after that baseline fires a toast naming the achievement. Pre-existing badges never replay on mount or on a switch back.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package is a pure browser-side owner: four slot registrations, one locale namespace, and no model-facing surface. The Host half is an empty `apply` and the invariant registers nothing.

### Slot registrations

`src/client/index.ts` registers the four entries through `ctx.slots.inject`, so each contribution follows its owning slot declaration's lifetime. The header and sidebar list entries receive an `openSquadDetails` action that calls `ctx.layout.openDetails('squad')`. The details entry occupies the `squad` key, and the toast is a list entry on `shell.overlay`.

### Data access

The header, sidebar, and details components take the session standard kit (`useProjection('squadProgress')`, `sessionId`) and read the current projection. The sidebar and toast take the global kit (`useSessions`) and select stable slices — the current session id and the per-parent subagent catalog — so an unchanged catalog reference does not re-render. Per-member level in the roster is each child's own durable `squadProgress` level, joined by session id.

### Level progress math

`src/client/level-progress.ts` re-derives the progress-to-next-level arithmetic from the documented curve (`level = floor(sqrt(xp / 10)) + 1`) rather than importing the Host level function, which would pull the Host bundle into the Web client. The helpers are pure and unit-tested against that curve.

### Locale

`src/client/locales.ts` owns the `squadProgress` namespace (English only) and a `BADGE_KEYS` map so a badge id renders through a typed locale key. The badge list is a closed union, so the map is exhaustive by construction.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [squad-progress](../../session/squad-progress/README.md) — the durable projection and XP curve this UI reads.
- [ui-session](../ui-session/README.md) — the session standard kit these components take.
- [ui-slots](../ui-slots/README.md) — the slot declarations these registrations target.
- [Web styling](../../../docs/web-styling.md) — the authoritative styling rules for web client components.
- [Squad gamification note](../../../.agents/notes/implemented/feature/2026-09-05-dao-squad-gamification.md) — the host-side capability that produces the projection.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side UI plugin layer that registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define the surface's data sources and the client-side math; they are current package constraints.

- **Level math is duplicated on the client** — `level-progress.ts` re-derives the progress-to-next-level values from the documented XP curve instead of importing the Host `levelFromXp`, so a curve change must be applied in both packages.
- **The roster is direct children only** — it lists the current session's immediate subagent entries; nested descendants are not flattened, and each member's level is that member's own projection.
- **The toast is transient, not a ledger** — the earned-badge baseline is in-memory per mount, so badges earned before the client mounted (or across a reload) do not replay as toasts.
- **Momentum and recent-wins are intentionally absent** — the design reserved those stats, but they have no durable projection source, so the package omits them rather than inventing data.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The client bundle inlines `clsx` and the `@daoai/dao-client-ui-primitives` icons. The `dao.client.inject` table records package relationships for composition inspection and HMR diffing; Cordis service injection controls activation.

</details>
