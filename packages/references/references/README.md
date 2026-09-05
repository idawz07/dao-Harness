---
description: "Storage-domain document and chunk store for ingested reference material, for users and maintainers composing or debugging the references capability."
kind: "package-reference"
---

# @daoai/dao-references

## Summary

`dao-references` stores ingested reference documents as durable chunks in a storage-domain unit. Callers add text from plain bodies, local paths, or URLs; search with keyword scoring; list, get, remove, and navigate an index tree. The singular `ctx.references` Store owns the domain. Model-facing tools live in `@daoai/dao-tool-references`; this package is the Host store only.

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

Mount with `storage`, a KV backend (`storage-json`), and `storage-domain`. The service opens the `references` domain (version 0) on init and closes it on dispose.

```yaml
- name: '@daoai/dao-storage'
- name: '@daoai/dao-storage-json'
  config:
    root: /path/to/storage
- name: '@daoai/dao-storage-domain'
  config:
    backend: json
- name: '@daoai/dao-references'
```

### Operations

| Method | Role |
|---|---|
| `addFromText` | Chunk (~2000 chars, ~200 overlap), SHA-256 hash each chunk, persist document + chunks |
| `addFromPath` | Read via `ctx.fs` when mounted, else `node:fs/promises`; title = basename |
| `addFromUrl` | `ctx.web.fetch`; fails loud when web is absent |
| `search` | Keyword score (tokenize on non-alphanumeric, casefold); default `topK` 5 |
| `get` | Full document or chunk (exactly one id) |
| `list` | Document summaries |
| `remove` | Delete document and its chunks |
| `index` | Sources → documents → chunk manifests (`id`, `index`, preview ≤ 120 chars) |

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Domain tables `documents` and `chunks` are declared in [`src/spec.ts`](src/spec.ts). Chunking and hashing live in [`src/chunk.ts`](src/chunk.ts); keyword scoring in [`src/search.ts`](src/search.ts). The service opens the domain in `Service.init` and registers an effect disposer that closes it.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | `ReferencesStore` service |
| [`src/types.ts`](src/types.ts) | Public request and value types |
| [`src/spec.ts`](src/spec.ts) | Domain declaration and zod row schemas |
| [`src/chunk.ts`](src/chunk.ts) | Fixed-window chunking and SHA-256 |
| [`src/search.ts`](src/search.ts) | Tokenize and keyword score |
| [`src/invariant.ts`](src/invariant.ts) | Empty companion (domain schema validates on reopen) |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [References package map](../README.md) — group layout.
- [dao-tool-references](../tool-references/README.md) — model-facing tools.
- [Reference store decision](../../../.agents/notes/implemented/feature/2026-09-05-dao-reference-store.md) — Stage 5 MVP rationale.

-----

<a id="model-experience"></a>
## Model Experience

### Local reference-store state

#### What the model sees

Nothing directly. `ctx.references` registers no tool or prompt section; model access is through `@daoai/dao-tool-references`.

#### Token effect

Zero from this package. Tool results and the tool-plugin system-prompt section are owned by the Consumer.

#### KV Cache effect

Independent. Store mutations do not rewrite a model request prefix.

## Known Limitations and Deferred Work

- **No Web `@doc` mention UI** — `index()` and `reference_index` ship; browser `@doc` completion is deferred (B1b UI half).
- **No session-query panel in reference UI** — B3 deferred.
- **No vectors or embeddings** — keyword scoring only.
- **Generic tool cards** — rich reference cards beyond generic/search presenters are deferred.
- **`addFromUrl` requires web** — compositions without `ctx.web` cannot ingest URLs.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Release-member packages cannot set `private: true` under workspace constraints; this package uses `publishConfig.access: public` like other `packages/` release members. The store is not mounted on the host base cordis by default — Scribe mounts it.

</details>
