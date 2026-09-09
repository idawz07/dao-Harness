---
description: "Roster-driven named delegation tools and model guidance for Dao squad members."
kind: "package-reference"
---

# @daoai/dao-squad-roster

## Summary

`dao-squad-roster` turns every effective squad member from `ctx.squad` into a named `subagent_<id>` delegation tool and a deterministic roster prompt section. Personas come from the member preset or its user-owned override, so direct member sessions and orchestrator delegations share one source. User tool settings are deny-only and combine with the shipped role policy; every child has `maxDepth: 0` and cannot delegate further.

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

Mount the plugin inside an orchestrator preset after the generic spawn and fork delegation tools. It requires `ctx.squad`, `ctx.systemPrompt`, and the services required by `dao-tool-subagent`.

```yaml
- id: squad-roster
  name: '@daoai/dao-squad-roster'
```

Direct mounts take no configuration and follow committed `squad/change` events. Agent presets pass an internal frozen member list from the session snapshot; that instance never follows later writes. Members sort by `order` and then id, so an unchanged roster renders byte-identical prose.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Each member tool is a programmatic `dao-tool-subagent` fiber with its own disposer. Replacement removes the old fiber before claiming the same tool name. Shipped roles retain their existing allow/deny policies, while persona text is read from the member's own preset. User deny entries intersect with that policy and never add a tool. The invariant companion checks the authoritative prompt assembly: every model-visible roster line must name a distinct delegation tool whose schema is present in the same assembly.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Agent presets](../../preset/agent-presets/README.md) — member discovery, persona overrides, and bounded authoring.
- [Subagent subsystem](../../../docs/subsystems/subagent.md) — child lifecycle and provider behavior.
- [System prompt subsystem](../../../docs/subsystems/system-prompt.md) — ordered scoped prompt sections.

-----

<a id="model-experience"></a>
## Model Experience

### Roster guidance and named tools

#### What the model sees

One stable roster line and one `subagent_<id>` schema per effective member. A member persona becomes the child system persona only after delegation; avatars and revisions never enter a model request.

#### Token effect

Prompt and schema cost grows linearly with the effective roster.

#### KV Cache effect

Stable for an unchanged roster. Adding, deleting, or editing a member changes the orchestrator's system prefix for sessions created under the new standing-preset generation.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Shipped role tool policies are first-party package data rather than editable fields. User changes can only add deny entries.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
