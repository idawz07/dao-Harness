// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@daoai/cordis'
import { stubSettingsScope, type StubSettingsScope } from '@daoai/dao-client-test-runtime'
import type { LocaleSettings, LocaleSnapshot } from '@daoai/dao-client-locale/client'
import { FALLBACK_LOCALE, LocaleRuntime } from '@daoai/dao-client-locale/client'

const make = (host?: StubSettingsScope<LocaleSettings>): {
  ctx: Context
  svc: LocaleRuntime
  events: LocaleSnapshot[]
} => {
  const ctx = new Context()
  const events: LocaleSnapshot[] = []
  ctx.on('locale/change', (snapshot) => { events.push(snapshot) })
  return { ctx, svc: new LocaleRuntime(ctx, host?.scope), events }
}

/**
 * Pin the browser environment a fresh service reads its initial locale from.
 * This package's own specs stub the globals directly instead of using
 * `usePinnedBrowserLanguages` (dao-client-test-runtime): they need the shapes
 * that helper deliberately cannot express — a missing `languages` list, a
 * list decoupled from `language`, and a non-browser run with no `window`.
 */
const stubLanguages = (...tags: string[]): void => {
  vi.stubGlobal('navigator', { languages: tags, language: tags[0] ?? '' })
}

/** Add a zh language pack for multi-locale registry coverage. */
function withZh(svc: LocaleRuntime, events?: LocaleSnapshot[]): void {
  svc.addLanguage({ id: 'zh', label: '中文', fallback: 'en' })
  if (events !== undefined) events.length = 0
}

describe('LocaleRuntime', () => {
  beforeEach(() => {
    stubLanguages('en-US')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts with exactly the shipped English locale', () => {
    const { svc } = make()
    expect(svc.getLocale().locales).toEqual([{ id: 'en', label: 'English' }])
    expect(svc.getLocale().active).toBe('en')
  })

  it('translates through the active-locale -> en -> key chain', () => {
    stubLanguages('zh-CN')
    const { svc } = make()
    withZh(svc)
    svc.register('ns', 'zh', { hello: '你好' })
    svc.register('ns', 'en', { hello: 'Hello', onlyEn: 'English only' })
    const t = svc.bind('ns')
    expect(svc.getLocale().active).toBe('zh')
    expect(t('hello')).toBe('你好')
    expect(t('onlyEn')).toBe('English only')
    svc.setLocale('en')
    expect(t('hello')).toBe('Hello')
    expect(t('missing.key')).toBe('missing.key')
  })

  it('falls through to the common vocabulary after the namespace misses', () => {
    stubLanguages('zh-CN')
    const { svc } = make()
    withZh(svc)
    svc.register('common', 'zh', { retry: '重试' })
    svc.register('common', 'en', { retry: 'Retry' })
    svc.register('ns', 'en', { own: 'Own' })
    const t = svc.bind('ns')
    expect(t('retry')).toBe('重试')
    expect(t('own')).toBe('Own')
    svc.setLocale('en')
    expect(t('retry')).toBe('Retry')
    expect(svc.bind('common' as string)('nope')).toBe('nope')
  })

  it('interpolates {name} params and leaves unknown placeholders intact', () => {
    stubLanguages('zh-CN')
    const { svc } = make()
    withZh(svc)
    svc.register('ns', 'zh', { greet: '你好，{name}！第 {n} 次', partial: '{known} 与 {unknown}' })
    const t = svc.bind('ns')
    expect(t('greet', { name: '世界', n: 2 })).toBe('你好，世界！第 2 次')
    expect(t('partial', { known: 'A' })).toBe('A 与 {unknown}')
  })

  it('bind returns a stable per-namespace function identity', () => {
    const { svc } = make()
    expect(svc.bind('a')).toBe(svc.bind('a'))
    expect(svc.bind('a')).not.toBe(svc.bind('b'))
  })

  it('rejects duplicate (ns, locale) and disposer only removes its own dict', () => {
    stubLanguages('zh-CN')
    const { svc } = make()
    withZh(svc)
    const dispose = svc.register('ns', 'zh', { k: 'v1' })
    expect(() => svc.register('ns', 'ZH', { k: 'v2' })).toThrow('already has locale')
    dispose()
    const t = svc.bind('ns')
    expect(t('k')).toBe('k')
    svc.register('ns', 'zh', { k: 'v2' })
    expect(t('k')).toBe('v2')
    dispose()
    expect(t('k')).toBe('v2')
  })

  it('serves the LocaleFace: snapshot revision moves on switch and registration', () => {
    stubLanguages('zh-CN')
    const { svc } = make()
    withZh(svc)
    const seen: number[] = []
    const off = svc.subscribe(() => { seen.push(svc.getSnapshot().revision) })
    expect(svc.getSnapshot()).toBe(svc.getLocale())
    const r0 = svc.getSnapshot().revision
    svc.register('ns', 'zh', { k: 'v' })
    expect(svc.getSnapshot().revision).toBe(r0 + 1)
    svc.setLocale('en')
    expect(seen).toEqual([r0 + 1, r0 + 2])
    off()
    svc.setLocale('zh')
    expect(seen).toHaveLength(2)
  })

  it('isolates a throwing subscriber: the rest still see the new revision', () => {
    stubLanguages('zh-CN')
    const { svc } = make()
    withZh(svc)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const seen: number[] = []
      svc.subscribe(() => { throw new Error('boom') })
      svc.subscribe(() => { seen.push(svc.getSnapshot().revision) })
      svc.setLocale('en')
      expect(seen).toEqual([svc.getSnapshot().revision])
      expect(spy).toHaveBeenCalledOnce()
    } finally {
      spy.mockRestore()
    }
  })

  it('register disposer republishes', () => {
    const { svc } = make()
    withZh(svc)
    const dispose = svc.register('ns', 'zh', { k: 'v' })
    const before = svc.getSnapshot().revision
    dispose()
    expect(svc.getSnapshot().revision).toBe(before + 1)
    dispose()
    expect(svc.getSnapshot().revision).toBe(before + 1)
  })

  it('setLocale writes through the scope and republishes only on a real change', () => {
    const host = stubSettingsScope<LocaleSettings>()
    stubLanguages('zh-CN')
    const { svc, events } = make(host)
    withZh(svc, events)
    svc.setLocale('en')
    expect(events).toHaveLength(1)
    expect(host.set).toHaveBeenCalledWith('preference', 'en')
    svc.setLocale('en')
    expect(events).toHaveLength(1)
    expect(host.set).toHaveBeenCalledTimes(2)
  })

  it('setLocale without a host scope stays process-local', () => {
    stubLanguages('zh-CN')
    const { svc, events } = make()
    withZh(svc, events)
    svc.setLocale('en')
    expect(events).toHaveLength(1)
    expect(svc.getLocale().active).toBe('en')
  })

  it('registers an external locale for selection, translation, persistence, and reversible disposal', () => {
    stubLanguages('zh-CN')
    const host = stubSettingsScope<LocaleSettings>()
    const { svc, events } = make(host)
    withZh(svc, events)
    expect(svc.getLocale().locales.map(locale => locale.id)).toEqual(['en', 'zh'])
    svc.register('ns', 'en', { hello: 'Hello' })
    const dispose = svc.addLanguage({ id: 'ja', label: '日本語', fallback: 'en' })
    svc.register('ns', 'ja', { hello: 'こんにちは' })
    svc.setLocale('ja')
    expect(svc.bind('ns')('hello')).toBe('こんにちは')
    expect(host.set).toHaveBeenCalledWith('preference', 'ja')
    expect(events.map(snapshot => snapshot.active)).toEqual(['ja'])
    dispose()
    expect(svc.getLocale().active).toBe('zh')
    expect(svc.getLocale().locales.map(locale => locale.id)).toEqual(['en', 'zh'])
  })

  it('rejects malformed language registrations and unknown setLocale ids', () => {
    const { svc } = make()
    expect(() => svc.addLanguage({ id: 'bad locale', label: 'Bad', fallback: 'en' }))
      .toThrow(/BCP 47/)
    expect(() => { svc.setLocale('nope') }).toThrow(/not registered/)
  })

  it('rejects a fallback that does not reach English', () => {
    const { svc } = make()
    expect(() => svc.addLanguage({ id: 'ja', label: '日本語', fallback: 'missing' }))
      .toThrow(/not registered/)
  })

  it('adopts a saved external locale when its definition registers later', () => {
    stubLanguages('zh-CN')
    const host = stubSettingsScope<LocaleSettings>()
    const { svc, events } = make(host)
    withZh(svc, events)
    host.publish({ status: 'ready', value: { preference: 'ja' }, revision: 1, writable: true })
    expect(svc.getLocale().active).toBe('zh')
    svc.addLanguage({ id: 'ja', label: '日本語', fallback: 'en' })
    expect(svc.getLocale().active).toBe('ja')
    expect(events.map(snapshot => snapshot.active)).toEqual(['ja'])
    expect(host.set).not.toHaveBeenCalled()
  })

  it('adopts a Host preference over the browser language without writing it back', () => {
    stubLanguages('zh-CN')
    const host = stubSettingsScope<LocaleSettings>()
    const { svc, events } = make(host)
    withZh(svc, events)
    host.publish({ status: 'ready', value: { preference: 'en' }, revision: 1, writable: true })
    expect(svc.getLocale().active).toBe('en')
    expect(host.set).not.toHaveBeenCalled()
  })

  it('an absent Host preference returns to the browser-derived locale', () => {
    stubLanguages('zh-CN')
    const host = stubSettingsScope<LocaleSettings>()
    const { svc, events } = make(host)
    withZh(svc, events)
    host.publish({ status: 'ready', value: { preference: 'en' }, revision: 1, writable: true })
    expect(svc.getLocale().active).toBe('en')
    host.publish({ status: 'ready', value: {}, revision: 2, writable: true })
    expect(svc.getLocale().active).toBe('zh')
  })

  it('opens provisionally in English when the browser names no shipped language', () => {
    stubLanguages('zh-Hant-TW')
    expect(make().svc.getLocale().active).toBe('en')
    stubLanguages('fr-FR', 'de')
    expect(make().svc.getLocale().active).toBe('en')
    vi.stubGlobal('navigator', { languages: [], language: 'en-US' })
    expect(make().svc.getLocale().active).toBe('en')
  })

  it('re-evaluates browser languages as external definitions register and unload', () => {
    stubLanguages('pt-BR', 'zh-CN')
    const { svc } = make()
    expect(svc.getLocale().active).toBe('en')
    withZh(svc)
    expect(svc.getLocale().active).toBe('zh')
    const dispose = svc.addLanguage({ id: 'pt-BR', label: 'Português (Brasil)', fallback: 'en' })
    expect(svc.getLocale().active).toBe('pt-BR')
    dispose()
    expect(svc.getLocale().active).toBe('zh')
  })

  it('runs outside a browser (node boots): the default decides and the machine language does not', () => {
    vi.stubGlobal('window', undefined)
    stubLanguages('zh-CN')
    const { svc } = make()
    expect(svc.getLocale().active).toBe('en')
    withZh(svc)
    expect(svc.getLocale().active).toBe('en')
    svc.setLocale('zh')
    expect(svc.getLocale().active).toBe('zh')
  })

  it('lets an explicit in-process preference replace the browser-derived value', () => {
    const { svc } = make()
    withZh(svc)
    svc.setLocale('zh')
    expect(svc.getLocale().active).toBe('zh')
  })

  it('serves English as both the opening locale and the dictionary fallback', () => {
    expect(FALLBACK_LOCALE).toBe('en')
    vi.stubGlobal('window', undefined)
    const { svc } = make()
    withZh(svc)
    svc.register('ns', 'zh', {})
    svc.register('ns', 'en', { onlyEn: 'English only' })
    svc.setLocale('zh')
    expect(svc.bind('ns')('onlyEn')).toBe('English only')
    svc.register('ns2', 'zh', { onlyZh: '仅中文' })
    svc.register('ns2', 'en', {})
    svc.setLocale('en')
    expect(svc.bind('ns2')('onlyZh')).toBe('onlyZh')
  })
})
