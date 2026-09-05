---
description: "Localization for the web GUI: English dictionaries, browser-derived fallback, typed namespace registration, and the framework translation seat, for users and plugin authors."
kind: "package-reference"
---

# @daoai/dao-client-locale

## Summary

`dao-client-locale` localizes the web GUI. The product ships English only: typed namespace dictionaries register through `ctx.locale.register(ns, { en })`, and consumers translate through the framework `t` seat. External client plugins may still `addLanguage` and register per-locale dictionaries; without a language pack the UI stays on English. On a loopback page, an explicit `locale.preference` in `$DAO_HOME/settings.yaml` can pin a registered language-pack id; a non-loopback page keeps its selection process-local. A fresh browser starts provisionally in the first registered language requested by `navigator`, falling back to English when none match.

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

Use it wherever the web GUI needs translated copy. Nothing needs configuration to mount — the package activates with the client tree and installs the English common dictionary.

### Active language

The shipped catalog contains only `en`. A browser without an explicit Host preference selects the first registered language that matches `navigator` by full tag and then primary subtag, falling back to English. Language-pack plugins that call `addLanguage` become selectable through `setLocale`; the product does not ship a Settings language row.

### Registering a dictionary

Call `ctx.locale.register(ns, { en })` with a namespace merged into `LocaleNamespaceMap`; the compiler checks every key against the namespace's typed key union and requires every shipped locale. Consumers translate through `ctx.locale.bind(ns)` or the framework-injected `t` seat. A dictionary registered after the UI is already mounted is picked up without a remount.

### Registering a language pack

An external client plugin registers the language definition and each translated namespace as owned effects; definitions and dictionaries may register in either order:

```js
export const inject = ['locale']

export function apply(ctx) {
  ctx.effect(
    () => ctx.locale.addLanguage({ id: 'ja', label: '日本語', fallback: 'en' }),
    'my-locale: language',
  )
  ctx.effect(
    () => ctx.locale.register('common', 'ja', {
      cancel: 'キャンセル',
      retry: '再試行',
    }),
    'my-locale: common dictionary',
  )
}
```

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

One `LocaleRuntime` owns the preference and the dictionary registry, and is itself the slot system's `LocaleFace`: `getSnapshot`/`subscribe` back the framework-injected `t` seat through `ctx.slots.installLocale`. The immutable snapshot carries the active locale, the selectable locales, and a monotonic revision; dictionary registration and locale switches both advance the revision, but only a switch emits the `locale/change` event. Product-authored Client UI text must enter through these typed dictionaries or an already-localized primitive prop; `verify-client-ui-i18n` enforces that source ownership ([decision](../../../.agents/notes/implemented/architecture/2026-08-23-locale-owned-client-ui-copy.md)). `scripts/locale-dictionary-parity.spec.ts` rejects a reintroduced non-English built-in dictionary export.

`FALLBACK_LOCALE` (`en`) is both the opening residual when the browser names no registered language and the terminus of every language-pack fallback chain.

-----

<a id="further-exploration"></a>
## Further Exploration

- [Locale-owned Client UI copy](../../../.agents/notes/implemented/architecture/2026-08-23-locale-owned-client-ui-copy.md)
- [Browser-derived initial locale](../../../.agents/notes/implemented/feature/2026-07-31-browser-derived-initial-locale.md)

Built-in locale ids live in `LOCALE_IDS` (`['en']`). Extending the shipped set means updating that constant, the built-in metadata table, and every `register(ns, { en })` call site's `Record<BuiltInLocaleId, …>` typing.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package only owns browser UI copy and the durable locale preference; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The product ships no Settings language switcher. Language-pack plugins that add locales must provide their own selection UI or rely on Host preference / browser detection.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
