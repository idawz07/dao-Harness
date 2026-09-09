# Agent Note: User-managed squad roster

Status: implemented

## Problem

The standard orchestrator duplicated six specialist personas inside delegation-tool rows even though the specialist presets already owned those personas. Users could copy whole privileged preset compositions, but had no bounded path to personalize a shipped specialist, create a persona-only member, restrict its tools, or assign client-only presentation metadata. Roster edits are model-visible, so reading current files when a session resumes would also make its prompt and tool configuration differ from its durable history.

## Decision

`@daoai/dao-agent-presets` provides `ctx.squad` over the effective preset roster. Shipped preset directories remain immutable. A shipped persona edit creates a user-root shadow containing `persona.override.yml`; user-authored members are minimal persona presets. Authoring accepts persona text, display metadata, deny-only tool restrictions, and allowlisted avatar bytes, with optimistic revisions, fixed field and collection limits, reserved delegation-name rejection, and user-root path confinement. It cannot author arbitrary plugin rows or complete system prompts. Persona and avatar edits have one authoritative sidecar commit point; avatar content uses revision-addressed files so a failed state write cannot replace the effective image or advance its revision.

`@daoai/dao-squad-roster` replaces the standard preset's duplicated specialist rows. It derives `subagent_<id>` registrations and deterministic roster guidance from the ordered effective members, combines user denies with first-party role policy, and prevents recursive delegation. Its invariant companion checks that every named tool in the model-visible roster has a distinct schema in the authoritative prompt assembly. Direct mounts follow committed roster changes. Agent-preset mounts receive an immutable roster list from the session generation.

Before publication, every squad-enabled session appends `squad/roster-snapshot` with the exact member identities, personas, descriptions, ordering, and restrictions that its preset generation mounts. Resume, fork, and parent-to-child composition reuse that snapshot. Avatars and revision stamps are excluded because they are not model-visible.

`@daoai/dao-squad-draft` makes one input-bounded, tool-free LLM request only after an explicit client action. It rejects failed, aborted, truncated, tool-requesting, malformed, or uncommittable responses and returns a draft; the user edits and commits it separately. The drafting transcript is not an agent session input. `ui-agent-preset` owns the corresponding review and management surface.

## Verification

Package tests pin stream termination, every authoring limit, reserved names, sidecar-backed persona and avatar state, roster reconciliation, authoritative assembly invariants, and queued achievements. The shipped Web composition test drafts and commits a member through the real services, mounts its named tool and guidance into a standard session, preserves that frozen generation after deletion, and excludes the member from a later session.

## Alternatives considered

- **Copy every shipped preset before editing** — rejected because copies stop receiving shipped composition updates and expose a much broader authoring surface than persona personalization requires.
- **Store member state in settings or a new database** — rejected because preset roots already own discovery, trust, and file lifecycle; a second authority would require reconciliation with those files.
- **Let a running roster react to every write** — rejected because the prompt and delegation schemas would cease to match the durable session inputs. Frozen session generations make edits apply predictably to new sessions.
- **Let draft output commit immediately** — rejected because generated persona and restriction choices require explicit review, and a malformed or injected draft must not become durable model input.

## Consequences

Specialist persona text has one source, user writes cannot expand a member's authority, and a session log reconstructs the roster that shaped model requests. Roster edits create new standing-preset generations; superseded generations remain mounted until process teardown because the existing mount does not count joined agents. Avatar files have no effect on generation identity or model requests. Generated initials remain the fallback when a member has no avatar.
