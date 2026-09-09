# Agent Note: Web Mission Control

Status: implemented

## Problem

The Web client exposed goals, subagent lineage, and squad progress as separate utility surfaces. It lacked a single session hierarchy that kept the current objective visible, made durable squad progress inspectable, and preserved Tool details in the same three-column shell. The built-in appearance also followed the operating system for a fresh user, so the product had no stable default canvas.

## Decision

The Web application presents a Mission Control hierarchy through existing Slot owners. `ui-goal` fills the single `conversation.session.header.mission` seat with the durable goal objective, phase, and admitted-round progress. `@daoai/dao-client-ui-squad-progress` reads `summary.projectionValues.squadProgress` and the session list to fill the session utilities, sidebar footer, `squad` details key, and shell overlay. The details column remains mounted when closed and selects either the existing Tool view or the squad view through the layout-owned key.

The squad package derives no reward values or activity history. Rank, XP, badge ids, and member levels come from session projections; roster membership and activity come from the subagent catalog. A missing progress projection renders an empty state, catalog loading and failure render distinct roster states, and newly observed badge ids produce transient feedback only after an in-memory baseline prevents replaying existing achievements.

The built-in appearance preference defaults to concrete `light`. The header toggle writes concrete `light` or `dark` through `ThemeRuntime`, so the settings provider remains the persistence owner and saved preferences still win. Theme-owned semantic aliases supply mission color, focus indication, shell surfaces, shadow, and motion; feature packages consume those aliases through CSS Modules.

## Alternatives considered

**Put the mission and squad UI directly in `AppFrame`.** Rejected because the frame owns column geometry, not goal or squad behavior. Slot contributions keep those capabilities removable and preserve the existing shell composition.

**Replace Tool details with a dedicated progress drawer.** Rejected because two independent right panels would duplicate collapse, resize, and narrow-layout behavior. A keyed child of the mounted details seat preserves Tool inspection and gives squad progress the same lifecycle.

**Copy the prototype's momentum, recent-win, checkpoint, or reward values.** Rejected because no durable projection owns those values. Omitting them keeps every displayed result reconstructable from the session log.

**Toggle a body attribute or browser storage from the header.** Rejected because it would create a second theme authority and bypass Host-backed settings revisions and failure recovery.

## Consequences

Fresh users see a stable light Mission Control canvas, while saved theme preferences remain authoritative. Goal and squad plugins can disappear without leaving fabricated fallback data; the shell and Tool details continue to operate without them. The client duplicates the documented XP-level arithmetic solely to display progress within a level, so a future curve change must update the Host projection owner and this client helper together. Achievement toasts are intentionally session-local feedback rather than a durable notification ledger.

## Required verification

- Focused ui-layout, ui-theme, ui-conversation, ui-chat, ui-goal, and ui-squad-progress tests pin concrete theme changes, mounted keyed details selection, Slot registration, durable projection rendering, roster states, and badge baselining.
- The keyless assembled Web snapshot boots the shipped composition with the Mission Control package present.
- Browser checks cover light and dark appearance, both panel controls, Tool and squad details, keyboard focus, narrow widths, and horizontal overflow.
