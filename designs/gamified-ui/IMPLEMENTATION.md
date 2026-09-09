# Implement the Dao Mission Control UI

Implement `designs/gamified-ui/v4.html` in the real Dao Web application. Treat the prototype and `designs/gamified-ui/v4.png` as the visual target, but preserve the application's existing Cordis plugin/Slot architecture and behavior.

## Required outcome

- Deliver the Mission Control visual overhaul across the real application shell, sidebar, conversation header/transcript, composer, and details column.
- Make light appearance the default for users without a saved preference.
- Provide an accessible header action that switches between concrete light and dark preferences through the existing `ThemeRuntime`; do not manipulate DOM attributes or `localStorage` directly.
- Keep both side panels collapsible:
  - the existing left sidebar must retain its collapsed rail and resize behavior;
  - the right details column must collapse to zero width, remain mounted, and support Tool details plus a keyed squad-progress surface.
- Use real `summary.projectionValues.squadProgress` data (`xp`, `level`, and badge IDs), never prototype constants. Provide sensible loading/empty presentation when a projection is unavailable.
- Add these gamification surfaces where they fit the existing Slot ownership:
  - mission/outcome progress in the session header;
  - compact XP/level status that opens the right progress panel;
  - squad status in the sidebar footer or another Sidebar-owned contribution point;
  - right-panel squad progress, roster/status, XP progress, and achievements;
  - restrained achievement feedback when newly earned badges become observable, if this can be implemented from durable state without inventing unlogged model-visible data.
- Preserve session lifecycle, workspace navigation, composer orchestration, tool selection/details, sidebar/details resizing, keyboard behavior, narrow layouts, and pending-interaction behavior.

## Repository requirements

Read and obey these before editing production packages:

- `AGENTS.md`
- `docs/architecture.md`
- `docs/defensive-patterns.md` before lifecycle or subscription work
- `docs/subsystems/web-client.md`
- `docs/subsystems/slots.md`
- `docs/subsystems/conversation.md`
- `docs/web-styling.md`
- `packages/AGENTS.md`
- `packages/client/AGENTS.md`
- `packages/web/AGENTS.md`
- `.agents/skills/dao-prose-standard/SKILL.md`
- `.agents/skills/record-browser-gif/SKILL.md`

Inspect `git status --short` first. The worktree contains many unrelated user changes. Do not clean, reset, overwrite, stage, or reformat unrelated files.

## Architecture and styling constraints

- Implement behavior through owning plugins and documented Slots; do not move product behavior into `AppFrame` merely for convenience.
- Use CSS Modules and `--dsw-alias-*` semantic tokens. Do not add Tailwind, a component library, literal feature colors, or ad hoc inline styling.
- Theme-wide color, typography, radius, shadow, and motion decisions belong in `@daoai/dao-client-ui-theme`; feature CSS consumes semantic aliases.
- All client-visible copy is locale-owned and accessed through typed `t` dictionaries.
- Every registration must be an effect via `ctx.slots.inject()`/`ctx.slots.register()` or the appropriate Cordis effect API.
- Keep public package exports narrow. Add package dependencies, peer dependencies, manifest injections, TypeScript references, invariant coverage, and CSS declarations where needed.
- Maintain visible `:focus-visible` states, minimum practical hit targets, responsive behavior, and `prefers-reduced-motion` handling.
- Avoid mount-time entrance animation for persistent application chrome. Use subtle state-transition motion only, with transform/opacity where practical and interruption-safe transitions.
- Add or update README/JSDoc contracts with code changes. This is non-trivial, so add an Agent Note under `.agents/notes/implemented/` following repository conventions; do not edit archived notes.

## Existing production surfaces

Start with these owners:

- Shell/layout: `packages/client/ui-layout/src/client/AppFrame.tsx` and `AppFrame.module.css`
- Sidebar: `packages/client/ui-sidebar/src/client/SidebarRoot.tsx` and `SidebarRoot.module.css`
- Conversation skeleton: `packages/client/ui-conversation/src/client/skeleton/`
- Chat/details: `packages/client/ui-chat/src/client/`
- Theme: `packages/client/ui-theme/src/`
- Existing compact squad display: `packages/client/ui-subagent/src/client/SubagentHeaderLineage.tsx`
- Squad projection: `packages/session/squad-progress/src/types.ts`, `badges.ts`, and `progress.ts`
- Web assembly roster: `packages/bundle/web-app/cordis.patch.yml` and `packages/bundle/web-app/package.json`

A dedicated client package such as `@daoai/dao-client-ui-squad-progress` is appropriate if the mission/header/sidebar/details contributions evolve together. Follow the structure of neighboring UI packages, including `package.json`, `tsconfig.json`, `tsdown.config.ts`, `src/index.ts`, `src/invariant.ts`, CSS declarations, README, locale dictionary, and focused tests.

## Work already started

Continue from the current worktree rather than duplicating or blindly reverting it. The partial edits have not been tested and may need correction:

- `ui-layout` now carries a `detailsSurface` key, lets `openDetails(surface?)` select it, and supplies `{ surface }` to the mounted details slot.
- `ui-chat` now declares keyed child slot `conversation.details.view`, routes Tool openings through `openDetails('tool')`, and branches `DetailsPanel` to render a keyed non-Tool view.
- `ui-theme` now changes `DEFAULT_PREFERENCE` to `'light'`, initializes the appearance settings store from that default, and contains new `ThemeToggle.tsx`/`ThemeToggle.module.css` plus a header registration.
- Several layout/chat/tool tests were updated for the new props.

Audit these edits carefully. In particular:

- Update all tests and bootstrap/host expectations that still assume the default preference is `system`.
- Add direct coverage for keyed non-Tool details rendering and fallback behavior.
- Ensure `packages/client/ui-theme/package.json` remains valid and dependency/reference ordering satisfies repository gates.
- Replace the literal easing in `ThemeToggle.module.css` with a theme-owned motion token.
- Check that Slot declarations, registration metadata, injected owners, and package invariants agree.
- Search for every `DetailsPanel` mount and every `ILayout` fake before typechecking.

## Suggested implementation sequence

1. Validate and finish the partial layout/chat/theme foundation with focused tests.
2. Add the squad-progress UI owner package and its keyed header/sidebar/details registrations.
3. Register that package in the Web bundle roster and dependency graph.
4. Extend semantic theme aliases, then restyle shell, sidebar, conversation, transcript, details, and composer toward v4.
5. Add responsive and reduced-motion states; verify both panel collapse controls with keyboard and pointer input.
6. Update package READMEs, JSDoc, the Agent Note, and any required keyless recorded-session snapshot.
7. Run the smallest relevant checks following `.agents/skills/dao-pre-push-checks/SKILL.md`; do not default to the full repository suite.
8. Boot the real app and verify light default, dark toggle persistence, left/right collapse and reopen, Tool details, squad progress, empty/loading states, narrow widths (320/390/760), desktop widths (1180/1440), focus visibility, no horizontal overflow, and reduced motion.
9. If preparing a pull request, record the required real-server/model-flow GIF according to `.agents/skills/record-browser-gif/SKILL.md`.

## Acceptance criteria

- The real Web application visibly matches the hierarchy and polish of v4 rather than merely embedding a prototype.
- Fresh users start in light appearance; saved preferences still win.
- Theme toggle is keyboard/screen-reader accessible and persists through the settings service.
- Both side panels independently collapse and reopen without losing application state.
- Tool details still work, and squad progress opens in the same right column through a keyed Slot contribution.
- Gamification values come from the durable squad-progress projection and all badge labels are localized.
- No hardcoded product copy, feature colors, leaked prototype constants, or direct DOM/storage theme ownership appears in feature packages.
- Focused tests, typecheck/build surfaces, documentation gates, responsive browser checks, and required snapshots/GIF evidence pass.

When finished, report only the files changed, commands run, test results, browser verification, and any remaining risk. Do not claim a check passed unless it was actually executed.
