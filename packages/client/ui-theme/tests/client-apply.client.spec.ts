// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup } from '@testing-library/react'
import { Context } from '@daoai/cordis'
import { stubSettingsScope } from '@daoai/dao-client-test-runtime'
import { SlotRegistry } from '@daoai/dao-client-ui-renderer/client'
import { LocaleRuntime } from '@daoai/dao-client-locale/client'
import type { ThemeRuntime } from '@daoai/dao-client-ui-theme/client'
import { apply, inject } from '@daoai/dao-client-ui-theme/client'

async function bench() {
  const ctx = new Context()
  const slotsFiber = ctx.plugin(SlotRegistry)
  // The Appearance row requires the connection seam for persistence; model
  // this bench as a remote, memory-only browser.
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
  ctx.provide('remote', { $on: () => () => {} } as never)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  await slotsFiber.await()
  return { ctx }
}

afterEach(cleanup)

describe('ui-theme client apply', () => {
  it('declares its service dependencies', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection', 'remote', 'settingsScope'])
  })

  it('seats the theme presenter: initial paint, follow, and full unwind on dispose', async () => {
    const { ctx } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    // Initial getter application: the default light preference paints light.
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(false)
    const themeColorMeta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    expect(themeColorMeta).not.toBeNull()
    const theme = ctx.get('theme') as ThemeRuntime
    theme.setTheme('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(true)
    expect(document.head.querySelector('meta[name="theme-color"]')).toBe(themeColorMeta)
    await fiber.dispose()
    expect(document.documentElement.style.colorScheme).toBe('')
    expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(false)
    expect(themeColorMeta?.isConnected).toBe(false)
    // Listener is off: further theme changes no longer reach the document.
    theme.setTheme('light')
    theme.setTheme('dark')
    expect(document.documentElement.style.colorScheme).toBe('')
    expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(false)
  })
})
