// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@daoai/dao-client-test-runtime'
import type { SnapshotSelectorHook } from '@daoai/dao-client-store'
import type { ThemeSnapshot } from '../src/client/index.ts'
import { en } from '../src/client/locales.ts'
import { ThemeToggle, type ThemeToggleProps } from '../src/client/ThemeToggle.tsx'

afterEach(cleanup)

function props(colorScheme: 'light' | 'dark', toggleTheme = vi.fn()): ThemeToggleProps {
  const snapshot: ThemeSnapshot = {
    preference: colorScheme,
    fontSize: 14,
    active: { id: colorScheme, colorScheme, tokens: {} },
    themes: [],
    revision: 0,
  }
  const useTheme: SnapshotSelectorHook<ThemeSnapshot> = select => select(snapshot)
  return {
    useTheme,
    toggleTheme,
    t: makeTranslate(en),
  } as unknown as ThemeToggleProps
}

describe('ThemeToggle', () => {
  it('offers dark mode from a light theme and routes the action', () => {
    const toggle = vi.fn()
    render(<ThemeToggle {...props('light', toggle)} />)
    const button = screen.getByRole('button', { name: en['toggle.dark'] })
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText(en['appearance.dark'])).toBeTruthy()
    fireEvent.click(button)
    expect(toggle).toHaveBeenCalledOnce()
  })

  it('offers light mode from a dark theme', () => {
    render(<ThemeToggle {...props('dark')} />)
    const button = screen.getByRole('button', { name: en['toggle.light'] })
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(en['appearance.light'])).toBeTruthy()
  })
})
