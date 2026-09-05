---
description: "The managed DAO_* shell environment for users and maintainers choosing, configuring, or extending the environment every model shell call runs with."
kind: "package-reference"
---

# @daoai/dao-shell-env

## Summary

`dao-shell-env` provides the trusted `DAO_*` environment that every model shell call — bash or pwsh — runs with: built-in facts such as `DAO_HOME`, `DAO_SHELL=1`, and the agent's `DAO_SESSION_ID`, plus `DAO_SESSION_JSONL` when the active persistence backend locates a JSONL artifact. Plugin authors can register their own facts with declared keys, collected per execution and disposed with their plugin; duplicate ownership or undeclared runtime keys fail loudly instead of silently overwriting. The registry changes nothing else the model sees — the shell tools own their own schemas and prompts. Choose it in any composition that mounts a model shell tool; configuration only picks the Harness home directory.

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

Load this plugin in any composition that mounts a model shell tool (`dao-tool-bash` or `dao-tool-pwsh`): each foreground or background shell call then runs with a freshly collected managed environment instead of whatever `DAO_*` values the process inherited.

### What every shell call receives

Every call receives `DAO_HOME` (the absolute Harness home), `DAO_SHELL=1`, and, for agent calls, `DAO_SESSION_ID` (the calling session's id). When the active persistence backend locates a JSONL artifact for the session, calls also receive `DAO_SESSION_JSONL` with its absolute target path — a location hint, not a guarantee: the file may not exist before the first flush and may not contain the current buffered turn, and the value is not an authorization credential.

### Adding your own environment facts

Other plugins contribute facts by registering a contributor with a stable name, the complete set of `DAO_*` keys it may return, a description per key, and a resolver that computes values for one execution:

```ts
import type { Context } from '@daoai/cordis'
import type {} from '@daoai/dao-shell-env'

export const inject = ['shellEnv']

export function apply(ctx: Context): void {
  ctx.shellEnv.register({
    name: 'deployment-region',
    variables: { DAO_DEPLOYMENT_REGION: { description: 'Current deployment region.' } },
    resolve: execution => execution.agent === undefined ? {} : { DAO_DEPLOYMENT_REGION: 'cn-north' },
  })
}
```

Contributors must declare every key they return; returning an undeclared or non-string value fails the call. Registration is disposed with the registering plugin, so hot-reloading a plugin removes its facts.

### Choosing the Harness home

The single config field picks the home directory exposed as `DAO_HOME`; the default resolution order is the `daoHome` config, then ambient `$DAO_HOME`, then `~/.dao`.

| Field | Default | Meaning |
|---|---|---|
| `daoHome` | `$DAO_HOME`, then `~/.dao` | Absolute Harness home exposed as `DAO_HOME` |

The generated [configuration catalog](../../../docs/config-catalog.md#daoaidao-shell-env) is the exhaustive source for every accepted field and its JSDoc.

### What can go wrong

Two contributors declaring the same key, or a contributor claiming a reserved built-in (`DAO_HOME`, `DAO_SHELL`, `DAO_SESSION_ID`), fails plugin load loudly. A `DAO_*` key must be all-caps with underscores (for example `DAO_REGION`), and a missing description fails registration.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the design decisions behind the registry and points at the code that realizes them; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

- **Trusted namespace, rebuilt per call.** The environment is a Harness-owned `DAO_*` namespace: the shell executor discards inherited `DAO_*` values and merges the registry's current snapshot for each execution, so nested harnesses and concurrent parent/child agents cannot leak stale identities, and `process.env` is never modified.
- **Declared ownership, loud conflicts.** Contributors declare their keys up front so duplicate ownership is detected before the first command; resolvers may only return declared keys.
- **Built-ins stay here.** `DAO_HOME`, `DAO_SHELL`, and `DAO_SESSION_ID` are reserved for the registry; `DAO_SESSION_JSONL` is contributed by this plugin's own persistence translator, which reads the backend-neutral `sessionPersistence.locate()` seam.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry, `ShellEnvRegistry` service, built-in facts and the persistence contributor |
| [`src/invariant.ts`](src/invariant.ts) | Invariant companion (no runtime invariant; collection is observable through tool execution) |

### Collection

`collect(execution)` starts from the built-ins, adds the session id when the execution carries an agent, then merges each registered contributor's resolved values sorted by contributor name. The result is a frozen, key-sorted snapshot passed through `ShellExecRequest.daoEnv`. `list()` enumerates declarations without running resolvers, so it cannot reflect execution-dependent values.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough. They move from the shell family to the executor seam and the generated catalogs.

- [shell package map](../README.md) — the bash capability family and its roles.
- [Bash executor subsystem](../../../docs/subsystems/shell.md) — the `ctx.shell` seam the tools execute through.
- [tool-bash](../tool-bash/README.md) — the bash tool that consumes this environment.
- [tool-pwsh](../tool-pwsh/README.md) — the pwsh tool that consumes this environment.
- [home paths package](../../util/home-paths/README.md) — how `DAO_HOME` is resolved.
- [Generated configuration catalog](../../../docs/config-catalog.md#daoaidao-shell-env) — every accepted config field and its source declaration.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the shell tools (`dao-tool-bash`, `dao-tool-pwsh`), which expose this registry's managed `DAO_*` facts in every shell-tool call.

#### KV Cache effect

The managed environment never enters the request prefix, so it does not invalidate provider cache reuse; the shell tools' definitions and the current request envelope own any prefix change.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the registry is a poor fit or needs care. They are current package constraints, not a task backlog.

- **`list()` enumerates plugin-contributed variables only** — registry-owned built-ins (`DAO_HOME`, `DAO_SHELL`, `DAO_SESSION_ID`) are not included, so diagnostics, prompt, or UI code must not treat `list()` as an exhaustive environment catalog.
- **`DAO_SESSION_JSONL` is a location hint, not a guarantee** — the file may not exist before the first flush and may not contain the current buffered turn, and the value is not an authorization credential.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
