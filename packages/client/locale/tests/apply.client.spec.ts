/** locale apply wiring: service + English dictionaries and document lang sync. */
import { Context } from '@daoai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@daoai/dao-client-ui-renderer/client'
import { apply as settingsApply, inject as settingsInject } from '@daoai/dao-client-ui-settings/client'
import { TestRemote } from '@daoai/dao-client-test-runtime'
import {
  apply, inject, COMMON_NS,
} from '@daoai/dao-client-locale/client'
import type { LocaleRuntime } from '@daoai/dao-client-locale/client'
import { LOCALE_SETTINGS_NAMESPACE, LocaleSettingsSchema } from '../src/locale-settings.ts'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  let preference: string | undefined
  let revision = 0
  const namespace = () => ({
    ns: LOCALE_SETTINGS_NAMESPACE,
    schema: LocaleSettingsSchema.toJSON(),
    value: preference === undefined ? {} : { preference },
    applies: 'live' as const,
    secrets: [],
    revision,
  })
  const describeCall = vi.fn(async () => ({
    ok: true as const,
    value: { writable: true, hasDocument: true, namespaces: [namespace()] },
  }))
  const mutate = vi.fn(async (_ns: string, ops: { value: string }[]) => {
    preference = ops[0]!.value
    revision += 1
    return { ok: true as const, value: namespace() }
  })
  ctx.provide('connection', { api: {}, isLoopback: true } as never)
  const events = new TestRemote(ctx, { settings: { describe: describeCall, mutate } })
  await ctx.plugin({ inject: [...settingsInject], apply: settingsApply }).await()
  return {
    ctx, slots: ctx.get('slots') as SlotRegistry, describe: describeCall, mutate, events,
    setHostPreference: (next: string | undefined) => { preference = next; revision += 1 },
  }
}

describe('locale apply', () => {
  it('declares the slot service', () => {
    expect(inject).toEqual(['slots', 'connection', 'remote', 'settingsScope'])
  })

  it('provides the service with the English common dictionary', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const locale = b.ctx.get('locale') as LocaleRuntime
    expect(() => locale.register(COMMON_NS, 'en', {})).toThrow('already has locale')
    expect(locale.getLocale().active).toBe('en')
    expect(locale.getLocale().locales.map(l => l.id)).toEqual(['en'])
    expect(locale.bind(COMMON_NS)('retry')).toBe('Retry')
  })

  it('projects external language-pack registration into the catalog', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const locale = b.ctx.get('locale') as LocaleRuntime

    const languagePack = b.ctx.plugin({
      inject: ['locale'],
      apply: packCtx => packCtx.effect(
        () => packCtx.locale.addLanguage({ id: 'ja', label: '日本語', fallback: 'en' }),
        'test language pack registration',
      ),
    })
    await languagePack.await()
    expect(locale.getLocale().locales.map(option => option.id)).toEqual(['en', 'ja'])

    await languagePack.dispose()
    expect(locale.getLocale().locales.map(option => option.id)).toEqual(['en'])
  })

  it('loads and refreshes the explicit Host preference after nonblocking activation', async () => {
    const b = await bench()
    b.setHostPreference('en')
    b.events.emit('settings/document-updated', [LOCALE_SETTINGS_NAMESPACE, 0])
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const locale = b.ctx.get('locale') as LocaleRuntime
    await vi.waitFor(() => { expect(locale.getLocale().active).toBe('en') })
    // Unknown preference falls back to the provisional locale.
    b.setHostPreference('ja')
    b.events.emit('settings/document-updated', [LOCALE_SETTINGS_NAMESPACE, 0])
    await vi.waitFor(() => { expect(locale.getLocale().active).toBe('en') })
    expect(b.describe).toHaveBeenCalled()
  })

  it('teardown is quiet without settings chrome contributions', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.ctx.get('locale')).toBeInstanceOf(Object)
    await fiber.dispose()
  })
})
