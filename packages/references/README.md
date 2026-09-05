---
description: "Package map for the reference document store: durable ingested sources with keyword search and model-facing tools."
kind: "package-group"
---

# references/ — reference document store

## Summary

The `references/` group stores ingested documents as durable chunks and exposes keyword search plus model-facing tools. The Host store opens a storage-domain unit; the tool Consumer registers `reference_*` tools. The Scribe preset mounts both; the host base does not mount them by default. This page maps the group; each package README owns its contract.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`references/`](references/README.md) | Document and chunk Store over storage-domain | `ctx.references` |
| [`tool-references/`](tool-references/README.md) | Model-facing ingest, search, get, list, remove, index tools | registers on `ctx.tools` |

-----

<a id="related-documentation"></a>
## Related documentation

- [Reference store decision](../../.agents/notes/implemented/feature/2026-09-05-dao-reference-store.md) — Stage 5 MVP scope and deferred UI.
- [Storage package map](../storage/README.md) — hub, backends, and domain form under the store.
- [Dao specialist squad presets](../../.agents/notes/implemented/feature/2026-09-05-dao-specialist-squad-presets.md) — Scribe mounts this capability.

<a id="dev-note"></a>
## Dev Note

None.
