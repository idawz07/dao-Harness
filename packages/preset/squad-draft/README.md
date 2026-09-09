---
description: "Explicit one-shot LLM drafts for user-reviewed Dao squad member personas and metadata."
kind: "package-reference"
---

# @daoai/dao-squad-draft

## Summary

`dao-squad-draft` turns a short description into one proposed squad-member name, description, persona, and restrict-only tool deny list. It makes exactly one tool-free LLM call after an explicit request and returns validated fields to the caller. It never commits a member, writes a session log, or re-runs at load; the user reviews and edits the result before `ctx.squad` stores it.

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

Mount the service on the Host beside `ctx.llm`, `ctx.squad`, and `ctx.tools`. Configure the exact route and output limits:

```yaml
- name: '@daoai/dao-squad-draft'
  config:
    provider: llama-router
    model: default
    maxOutputTokens: 1200
    maxInputBytes: 65536
    maxPersonaBytes: 16384
    timeoutMs: 30000
```

Call `draft(description, baseMember?)` only from an explicit UI action. The returned object is a draft, not persisted state.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The fixed system instruction demands one JSON object. The user description, currently visible host tool names, and optional base member are serialized as data in one user message. `maxInputBytes` bounds that complete message, and the request supplies an empty tool list. Validation rejects failed, aborted, truncated, or tool-requesting streams; non-JSON output; blank, multiline display fields, or oversized fields; oversized deny lists; and invalid tool names. Deny suggestions need not appear in the host-global registry because model tools normally live in a preset scope, and an unknown deny entry cannot grant capability.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Agent presets](../agent-presets/README.md) — reviewed commit and user-root persistence.
- [LLM subsystem](../../../docs/subsystems/llm-streaming.md) — provider-neutral model calls.

-----

<a id="model-experience"></a>
## Model Experience

### Draft request

#### What the model sees

A fixed `system` instruction and one JSON data object. No tools, retrieval, session history, avatar bytes, or uncommitted draft from another request is present.

#### Token effect

One bounded auxiliary request per explicit draft action.

#### KV Cache effect

Independent of agent-session prompts; the fixed system prefix can be reused across draft calls on the same route.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Draft quality depends on the configured model. Validation protects persistence constraints, not prose quality; user review remains required.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
