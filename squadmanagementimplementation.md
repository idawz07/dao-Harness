# Squad Management Implementation Plan

User-facing squad management: edit default squad members' personas, create new members
from a short description (AI-drafted, user-reviewed), and assign avatars. This plan
builds only on existing seams; it does not redesign presets, delegation, or the
system-prompt registry.

Status: implemented. Pre-release stance applies — rename freely, no compatibility promise.

## 1. Scope

In scope:

- Edit the persona text of shipped (default) squad members, per user.
- Create new squad members; delete user-authored ones.
- AI-enhance a user-entered description into a draft persona/metadata, user-reviewed
  before saving. One-shot; never re-run at load.
- Avatars per member, UI-only.

Out of scope (explicit non-goals):

- Raw system-prompt editing, `complete: true` user prompts, or user control over
  harness identity, tool guidance sections, or approval/permission prose.
- Granting members tools beyond their parent's visible universe. User edits are
  restrict-only.
- Multi-user sync, sharing, or a marketplace for members.
- The experimental agent-team profile's standing-member model; squad here is the
  preset roster + named delegation tools.

## 2. Current state (what already exists)

| Surface | Location | Facts |
|---|---|---|
| Preset roster + user root | `packages/preset/agent-presets` | Shipped presets under `presets/` (read-only `system` root); user presets under `$DAO_HOME/.agent-presets` (`user` root). Discovery re-reads roots on every call. |
| Authoring | `packages/preset/agent-presets/src/authoring.ts` | The only authoring write today is a **whole-directory copy** of an existing preset, plus delete. No caller supplies composition text. Confined to `user` roots; copies never overwrite. |
| Display metadata | `packages/preset/agent-presets/src/metadata.ts` | Optional `preset.yml` beside the composition: `name`, `description`, `order`. Presentation-only; read failures degrade to empty metadata. |
| Standing mounts | `packages/preset/agent-presets/src/index.ts` | Stamped mounts; an edited composition file starts the next generation. There is an open TODO about reclaiming superseded generations. |
| Persona row | `packages/preset/persona` | `@daoai/dao-persona` registers the `deployment:persona` section for one agent scope; config: `text`, `complete`, `includeRuntimeContext`. Shadowing the global persona is its entire purpose. |
| Named delegation tools | `packages/preset/agent-presets/presets/standard/agent.cordis.yml` | The `standard` orchestrator hardcodes one `@daoai/dao-tool-subagent` row per specialist (`subagent_scout`, `subagent_forge`, `subagent_lens`, `subagent_quill`, `subagent_relay`, `subagent_scribe`), each with an **inline persona copy** and a `toolFilter`. |
| Delegation tool | `packages/subagent/tool-subagent` | Per-child `persona`, `toolFilter` (allow/deny), `agentOptions`, `maxDepth`, background modes. |
| User settings | `packages/settings` (+ `settings-file`) | Namespaces with schemas, user overrides with expected-revision writes, per-namespace serial writes. |
| Picker UI | `packages/client/ui-agent-preset`, mounted in `packages/bundle/web-app/cordis.patch.yml` (`ui-agent-preset` row) | Settings-page preset row; renders nothing absent a roster. |
| Session durability | `packages/core/session` | The session header durably records the preset id the agent was composed from. |
| Product vocabulary | `packages/session/squad-progress` | "Squad" already ships as product language (XP/levels/badges projection). |

Key structural debt this plan removes: **persona text is duplicated** — each member
preset (e.g. `presets/quill/agent.cordis.yml`) carries its persona, and the `standard`
preset carries the same personas again inline on its delegation-tool rows. Editing one
diverges the other. Roster-driven registration (Phase 2) makes the preset the single
source.

## 3. Design decisions (locked)

1. **Shadow, never fork.** User persona edits of shipped members are stored as a
   sidecar override in the `user` root and applied over the shipped composition at
   mount time. Shipped preset upgrades keep flowing underneath; the override file is
   the only user-owned state. Copy-then-edit remains available for power users but is
   not the product path.
2. **Bounded authoring write.** The existing authoring invariant ("no caller supplies
   composition text") is extended, not broken: a new write accepts exactly one field —
   the persona text — plus display metadata. It cannot add plugin rows, tool grants,
   or `complete` sections.
3. **Restrict-only tools.** A member's effective tool set is the parent's visible
   universe minus restrictions. The user (and the AI drafter) may only remove tools.
   `toolFilter` is stored as deny entries derived from the base preset's universe.
4. **No `complete` for user members.** User persona edits are additive sections;
   user-authored-from-scratch members likewise register persona + restrictions, never
   a complete prompt. `complete` stays a deployment/preset authoring decision.
5. **Avatar is UI-only metadata.** An avatar never enters `assemble()` output, tool
   schemas, or any model-visible field. It is rendered by client surfaces only.
6. **AI draft is a reviewed one-shot.** The drafting call returns a draft object to
   the UI. The user reads, edits, and commits. The committed text is what is stored,
   verbatim, and what is model-visible. No auto-commit, no regeneration at load, no
   re-drafting of an existing member without an explicit user action.
7. **Model-visible ⟺ logged.** Persona overrides and new members are model-visible
   input; the session log must make them reconstructable (see Phase 4).
8. **User-root trust is unchanged.** A user-authored preset carries the same trust as
   shell access (existing stance, already documented in the web-app bundle). The new
   writes inherit that trust; they do not widen it.

## 4. Target architecture

```
preset directory (system root, read-only)        user root ($DAO_HOME/.agent-presets)
  quill/                                          my-reviewer/
    agent.cordis.yml  (composition + persona row)  agent.cordis.yml
    preset.yml            (name, description, order)  preset.yml
    avatar.png                                            avatar.png
    persona.override.yml  ← new, user-root only       (persona lives in composition)
```

Data model per member, as the roster exposes it (extending `AgentPresetRow`):

- `id` (directory name; existing `PRESET_ID` validation), `trust` (`system` | `user`)
- `name`, `description`, `order` (existing metadata)
- `avatar` (new: filename beside the composition, e.g. `avatar.png`; client-resolved
  URL served by the web host; absent = generated initial, as today)
- `persona` (new: effective persona text — composition value, or the override where
  one exists), `personaOverridden` (new: boolean, for UI affordance)
- `tools` (new: effective deny list relative to the default preset's universe;
  empty = unrestricted within the universe)

Capability seam (named `squad` until renamed; roles per repo convention):

- **Service Definition** — new `ctx.squad` on `Context`: roster read (members with
  the fields above), persona override read/write, member create/delete, avatar
  read/replace, draft request. Owns the invariants: user-root confinement,
  restrict-only tools, no `complete`, id validation, expected-revision on writes.
- **Service Provider** — the agent-presets package extended (roster already lives
  there; authoring already lives there). Keep the file I/O, stamps, and root model
  in place; the seam is the typed surface above it.
- **Consumers** — (a) a roster-driven delegation registration that derives
  `subagent_<id>` tools from the roster (Phase 2); (b) the settings/client surface
  (Phase 3); (c) the drafting service (Phase 4).

Persistence: no new storage backend. Persona overrides and new members are files in
the `user` root (override sidecar; new member directory), which the existing stamped
standing-mount machinery already watches. Avatar is a file in the preset directory.
`dao-settings` is used only if a per-user preference (e.g. "drafts: on/off", last
selected member) needs runtime override semantics; member data itself stays in files.

## 5. Phases

### Phase 0 — Foundations (Agent Note + design contract)

1. Agent Note (`.agents/notes/`, `implemented/` once merged, draft while open):
   records the shadow-vs-fork decision, the bounded-authoring-write extension, the
   restrict-only rule, and the avatar-is-UI-only invariant, with links here.
2. Draft the `ctx.squad` Service Definition types and the extended `AgentPresetRow`
   as the cross-package contract; add to the capability-seam docs once the row exists.
3. Decide and record the override sidecar format: `persona.override.yml` beside the
   user-root composition, fields `persona` (string) and revision stamp; one home per
   fact (persona text lives here, composition stays pristine for shipped ids).

Acceptance: note and type contract reviewed; no behavior change.

### Phase 1 — Host authoring writes (no UI)

Package: `packages/preset/agent-presets`

1. `authoring.ts`: add the bounded writes behind the service definition:
   - `savePersona(id, text, expectedRevision)` — user root only; for a `system`-root
     id, writes the sidecar beside a **shadow copy** (the user root gains
     `<id>/persona.override.yml` plus metadata passthrough — composition itself is
     never written; mount resolution prefers user root, sidecar applies on top).
     For a `user`-root id, edits the persona row in its own composition via the
     existing whole-file path (user already owns that file).
   - `createMember(id, { name, description, persona, toolsDeny })` — user root only;
     materializes a minimal composition (persona row + tool restrictions + the tools
     the deny list implies) with validated id, non-colliding directory, metadata
     file. No `complete` row, ever, from this path.
   - `deleteMember(id)` — extends the existing delete to user root only (already true;
     make it explicit and loud for `system` ids).
   - `saveAvatar(id, bytes)` / avatar replace — user root only; fixed allowlist of
     image formats, size cap; `system` ids reject (an avatar for a shipped member is
     created by shadow-copying first — same path as persona).
2. `metadata.ts`: add `avatar` (filename, validated to sit inside the preset
   directory — no path traversal, no URLs) to `PresetMetadata`; keep the
   presentation-only degradation (bad avatar = no avatar, never a failed mount).
3. Mount resolution: when a `system` id has a user-root shadow, mount the shipped
   composition with the user-root persona override applied as a scope registration
   (persona row text replaced before mount; keep the override revision in the stamp
   so edits refresh the standing generation through the existing stamp path).
4. Invariant companion (`invariant.ts`): assert the owned relationships — every
   user-root write landed in a user-root path; every `system` id's composition bytes
   are unchanged; no authored composition contains a `complete` persona row.

Acceptance: host-side round-trip (script or test driver) — save persona on a shipped
id, create a member, set avatar, delete; stamps refresh standing mounts; shipped
files byte-identical. Unit tests per write path, including every reject (system
composition write, traversal, `complete`, duplicate id, stale revision).

### Phase 2 — Roster-driven delegation registration

Packages: new `packages/subagent/squad-roster` (name may change; it is the Consumer
that registers tools), edit `packages/preset/agent-presets/presets/standard/agent.cordis.yml`.

1. New plugin reads the roster (members with `persona`, `toolsDeny`, `maxDepth: 0`)
   and registers one `@daoai/dao-tool-subagent` row per member with
   `toolName: subagent_<id>`, the effective persona, and the derived `toolFilter`
   deny list. Registration is an effect; the disposer removes the tools when the
   roster loses a member.
2. Rewrite the `standard` preset: delete the six hardcoded specialist rows; mount the
   roster-driven registration instead. Personas for the six shipped specialists move
   to (or are read from) their own preset files — **single source, duplication
   deleted**. The orchestrator's roster guidance section (the "Your roster: Scout
   (research)..." prose) becomes roster-derived text listing effective members, so a
   user-created member appears in the orchestrator's instructions automatically.
3. Tool-universe rule enforced here: the deny list is always computed against the
   parent's visible tool set at registration; a member can never expose a tool the
   parent does not have.
4. Ordering: `FIRST_PARTY_SECTION_ORDER` gets the roster guidance slot; keep
   prefix-stable ordering so KV cache reuse survives roster churn (stable sort by
   `order` then `id`).

Acceptance: `subagent_scout` … `subagent_scribe` behave identically to today
(snapshot-replay proof, Phase 5); a user-created member is delegable from `standard`
in a new session; deleting a member removes its tool; cache-prefix check: unchanged
roster renders byte-identical guidance.

### Phase 3 — Web UI (client surface)

Package: `packages/client/ui-agent-preset` extended (or a sibling `ui-squad` client
plugin if the settings-page row stays picker-only — decide in Phase 0; the roster
page is the product surface).

1. Roster view: member cards — avatar (or generated initial), name, description,
   trust badge (`shipped` vs `yours`), effective persona (read-only preview), tool
   restriction summary.
2. Edit flow (shipped members): "Personalize" → shadow-copy + persona editor
   (plain text, `{{model}}`/`{{cwd}}` variables documented in the placeholder help),
   save with expected-revision (stale writer refused, as in `dao-settings`),
   "reset to shipped" (delete sidecar).
3. Create flow: name + description + optional description box → Phase 4 draft →
   review screen (draft persona editable, suggested tool restrictions as checkboxes,
   default all-unrestricted-minus-subagent-tools) → commit via `createMember`.
4. Avatar picker: local file or a small shipped set; preview on the card; UI-only —
   assert no request to the model carries avatar bytes (e2e assertion).
5. i18n: all copy through typed dictionaries (`verify-client-ui-i18n`); English
   ships; copy owned in locale files.
6. Host presenters stay pure; cards derive from roster events + persisted member
   metadata per the tool-UI presentation rule.

Acceptance: full create → delegate → edit → reset loop in the real web app; stale
write refused; avatar never in a model request (wire assertion).

### Phase 4 — AI drafting service

Package: new small plugin (provisionally `packages/preset/squad-draft`), a Consumer
of the `llm` capability.

1. One endpoint: `draft(description, baseMember?)` → `{ name, description, persona,
   toolsDenySuggestion }`. Implementation is exactly one LLM call.
2. The drafting system prompt is fixed product text (a first-party section or
   in-process constant owned by this package); the user's description is passed as
   data, labeled as data, with an instruction that it must not override the drafting
   contract. Single call, no tools available to the drafting call, no retrieval.
3. Output is schema-validated (persona is non-empty text under a token/length cap;
   suggested denies only reference real tool names from the base universe; no
   `complete`); a malformed draft returns an error to the UI, never a partial commit.
4. The draft is never logged as model-visible session input (it is a drafting-side
   request, telemetry-traced like other LLM calls); only the **committed** text
   enters the session as model-visible input.
5. No auto-draft on load; explicit user action only. Regeneration of an existing
   member's persona is a new explicit action that shows the current text as context.

Acceptance: drafting a member from "a QA reviewer that checks tests before merge"
produces a draft the user edits and commits; the committed persona is verbatim in
the stored override; the drafting call's transcript is not in any session log.

### Phase 5 — Session log, snapshots, SDKs, docs

1. Session events: persona override and member creation are model-visible input.
   The session header already records the preset id; extend the durable vocabulary
   so a log can reconstruct the effective persona (and member roster version) for a
   session — a new `SessionEventMap` member if the header is insufficient. Every
   member is required-on-read; a structural format change bumps
   `SESSION_FORMAT_VERSION` (currently `0`, no promise — still do it deliberately).
2. Snapshots (keyless recorded sessions): new cases under `snapshots/session/` —
   (a) `standard` with a user persona override on a shipped member; (b) delegation
   to a user-created member; (c) roster guidance section with a user member present.
   Existing `standard`-orchestrator snapshots must stay green after Phase 2
   (duplication deletion changes nothing model-visible if the personas are identical
   — if they are not, re-record and explain in the PR).
3. SDKs: TypeScript and Python expected outputs update in the same PR for any
   agent-loop/`SessionEventMap` change; `pnpm run test` covers neither.
4. Docs: `dao-agent-presets` README (new authoring writes, override semantics,
   avatar), config catalog, capability-seam docs for `ctx.squad`, subsystem doc
   `docs/subsystems/system-prompt.md` if the roster guidance slot lands there,
   `docs/capability-seams.md` row. `pnpm run doc-sync`.
5. Agent Note update: mark implemented with the final names; archive per policy if
   superseded later.
6. PRs that change product-user-visible GUI behavior include a GIF recorded from the
   PR's real server and model flow (`record-browser-gif`).

## 6. Invariants and security rules (enforced, not documented-only)

- System-root composition bytes are never written by any user-facing path.
- Authoring writes target the user root only; id validated by the existing
  `PRESET_ID`; no path traversal in metadata/avatar filenames.
- No `complete` persona row can originate from a user-facing write.
- Member tools ⊆ parent visible tools; the user and the drafter can only restrict.
- Avatar bytes never enter model requests, tool schemas, or session events.
- Drafted text commits only on explicit user action, verbatim, and only then becomes
  model-visible and logged.
- Stale writers refused (expected-revision), consistent with `dao-settings`.
- Presentation (metadata, avatar) failures degrade; capability failures fail loud.

## 7. Risks and resolved questions

- **Persona duplication drift until Phase 2.** Phase 1's override sidecar and
  Phase 2's single-source registration coexist briefly; keep Phase 2 close behind
  Phase 1 in the stack.
- **KV cache.** A user override changes a child's system prefix — expected and
  per-member; the roster guidance section must stay prefix-stable for unchanged
  rosters (stable ordering, deterministic text).
- **Draft quality.** LLM-drafted personas drift verbose; cap length in the drafting
  contract and in validation, and keep the review screen prominent. The user
  reading the draft is the feature, not a formality.
- **Upgrade semantics.** Document precisely what "reset to shipped" and shipped
  updates do to existing overrides (override persists; composition text underneath
  updates).
- **Client package:** `ui-agent-preset` owns the squad settings section so preset and
  member authoring share one roster controller and refresh path.
- **Avatar fallback:** this change ships generated initials and user-uploaded images;
  it does not add curated binary portraits.
- **Standing generations:** superseded generations remain mounted until process
  teardown. The package README and Agent Note document the per-edit generation cost;
  reclamation still requires joined-agent accounting.

## 8. Suggested PR stack

1. Agent Note + `ctx.squad` types + override format (Phase 0).
2. Host authoring writes + metadata/avatar (Phase 1).
3. Roster-driven delegation; `standard` preset de-duplication (Phase 2).
4. AI drafting service (Phase 4 — lands before the UI that calls it).
5. Web UI (Phase 3) + GIF.
6. Session events, snapshots, SDK expected outputs, docs (Phase 5; may split into
   the events PR and the snapshots/docs PR).

Each PR: pre-push checks per the `dao-pre-push-checks` skill, focused tests,
snapshot updates where model-visible output changes, docs updated in the same PR.
