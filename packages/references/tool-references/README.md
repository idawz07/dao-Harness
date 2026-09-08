---
description: "Model-facing reference_add/search/get/list/remove/index tools over ctx.references, for users and maintainers composing or debugging the reference store Consumer."
kind: "package-reference"
---

# @daoai/dao-tool-references

## Summary

`dao-tool-references` registers six model-facing tools over `ctx.references`: ingest (`reference_add`), keyword search, get, list, remove, and index navigation. A short system-prompt section teaches when to use the store. Mount it with `@daoai/dao-references` (and storage-domain) on compositions that should expose the store — the Scribe preset does so; the host base does not mount it by default.

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

```yaml
- name: '@daoai/dao-references'
- name: '@daoai/dao-tool-references'
```

| Tool | Args | Role |
|---|---|---|
| `reference_add` | path XOR url XOR {title, text} | Ingest |
| `reference_search` | query, optional top_k (default 5) | Keyword hits |
| `reference_get` | document_id XOR chunk_id | Full row |
| `reference_list` | (none) | Summaries |
| `reference_remove` | document_id | Delete |
| `reference_index` | (none) | Sources → documents → chunk previews |

Pending cards use generic presenters with `kind: 'search'` / `'read'` / `'write'` where applicable.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Registration is effect-based through `ctx.tools.register`. The prompt section uses `FIRST_PARTY_SECTION_ORDER.TOOL_REFERENCES`. Text ingest stores source `{ kind: 'path', value: 'inline' }`.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dao-references](../references/README.md) — store API.
- [Reference store decision](../../../.agents/notes/implemented/feature/2026-09-05-dao-reference-store.md).

-----

<a id="model-experience"></a>
## Model Experience

### Tool schemas

#### What the model sees

The six `reference_*` tools in the generated [tool catalog](../../../docs/tool-catalog.md#daoaidao-tool-references) when this plugin is mounted and not restricted away.

#### Token effect

Conditional on tool visibility: schemas enter the request when the tools are in scope; results enter after each call.

#### KV Cache effect

Append-only for new tool results. Registering or disposing the plugin changes the tool-schema prefix and can invalidate reuse.

### Reference-store guidance section

#### What the model sees

When mounted, the plugin injects reference-store guidance into the system prompt explaining how to ingest, search, inspect, and remove references.

##### Verbatim text for this field

```markdown
Use the reference_* tools to ingest durable source material into the reference store, search it by keyword, fetch a document or chunk, list holdings, remove stale entries, and navigate the index (sources → documents → chunk previews). Prefer ingesting with reference_add (path, url, or title+text) when the squad will need the material later; use reference_search before re-reading large sources you already stored.
```

#### Token effect

Fixed when the plugin is mounted.

#### KV Cache effect

Prefix-stable while the section text is unchanged; remounting or editing the section invalidates that prefix segment.

## Known Limitations and Deferred Work

- **No Web `@doc` mention UI** — `reference_index` ships; browser `@doc` completion is deferred.
- **No session-query panel in reference UI** — B3 deferred.
- **No vectors or embeddings** — keyword search only.
- **Generic tool cards** — custom rich cards beyond generic/search presenters are deferred.

<a id="dev-note"></a>
### Dev Note

None.
