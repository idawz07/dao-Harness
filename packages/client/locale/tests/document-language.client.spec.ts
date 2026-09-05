// @vitest-environment jsdom
/**
 * `<html lang>` tracks the active locale.
 *
 * The served markup declares one language, but the resolved locale may differ
 * (browser detection, or a stored Host preference adopted after activation),
 * and it changes again whenever a language-pack plugin switches it. Assistive
 * technology and browser features read this attribute, so a stale value
 * misreports the document language rather than merely looking untidy.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@daoai/cordis'
import { SlotRegistry } from '@daoai/dao-client-ui-renderer/client'
import { apply as settingsApply, inject as settingsInject } from '@daoai/dao-client-ui-settings/client'
import { TestRemote } from '@daoai/dao-client-test-runtime'
import { apply, inject } from '@daoai/dao-client-locale/client'
import type { LocaleRuntime } from '@daoai/dao-client-locale/client'
import { LOCALE_SETTINGS_NAMESPACE, LocaleSettingsSchema } from '../src/locale-settings.ts'

/** Boot the plugin over a stub Host settings document. */
async function bench(preference?: string) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  let stored = preference
  let revision = 0
  const namespace = () => ({
    ns: LOCALE_SETTINGS_NAMESPACE,
    schema: LocaleSettingsSchema.toJSON(),
    value: stored === undefined ? {} : { preference: stored },
    applies: 'live' as const,
    secrets: [],
    revision,
  })
  const describeRpc = vi.fn(async () => ({
    ok: true as const,
    value: { writable: true, hasDocument: true, namespaces: [namespace()] },
  }))
  const mutate = vi.fn(async (_ns: string, ops: { value: string }[]) => {
    stored = ops[0]!.value
    revision += 1
    return { ok: true as const, value: namespace() }
  })
  ctx.provide('connection', { api: {}, isLoopback: true } as never)
  new TestRemote(ctx, { settings: { describe: describeRpc, mutate } })
  await ctx.plugin({ inject: [...settingsInject], apply: settingsApply }).await()
  await ctx.plugin({ inject: [...inject], apply }).await()
  return { ctx, locale: ctx.get('locale') as LocaleRuntime }
}

const langOf = (): string => document.documentElement.lang

describe('document language', () => {
  beforeEach(() => {
    document.documentElement.lang = 'fr'
    Object.defineProperty(navigator, 'languages', { value: ['en-US'], configurable: true })
    Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true })
  })

  afterEach(() => {
    const own = navigator as unknown as Record<string, unknown>
    delete own.languages
    delete own.language
  })

  it('states the resolved locale at activation, not the value the markup shipped', async () => {
    const { locale } = await bench()
    expect(locale.getLocale().active).toBe('en')
    expect(langOf()).toBe('en')
  })

  it('falls back to English when the browser names an unshipped language', async () => {
    Object.defineProperty(navigator, 'languages', { value: ['zh-CN'], configurable: true })
    Object.defineProperty(navigator, 'language', { value: 'zh-CN', configurable: true })
    const { locale } = await bench()
    expect(locale.getLocale().active).toBe('en')
    expect(langOf()).toBe('en')
  })

  it('follows a language-pack switch with the pack id as the document language', async () => {
    const { locale } = await bench()
    expect(langOf()).toBe('en')
    locale.addLanguage({ id: 'pt-BR', label: 'Português', fallback: 'en' })
    locale.setLocale('pt-BR')
    expect(langOf()).toBe('pt-BR')
    locale.setLocale('en')
    expect(langOf()).toBe('en')
  })

  it('follows an explicit Host preference that overrides browser detection', async () => {
    Object.defineProperty(navigator, 'languages', { value: ['fr-FR'], configurable: true })
    Object.defineProperty(navigator, 'language', { value: 'fr-FR', configurable: true })
    const { locale } = await bench('en')
    await vi.waitFor(() => { expect(locale.getLocale().active).toBe('en') })
    await vi.waitFor(() => { expect(langOf()).toBe('en') })
  })
})
