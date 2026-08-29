// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { DocumentTitle } from '../src/client/DocumentTitle.tsx'

afterEach(() => {
  cleanup()
  document.title = ''
  vi.unstubAllEnvs()
})

describe('DocumentTitle', () => {
  it('projects a durable title and restores the product title', () => {
    vi.stubEnv('DAO_CLIENT_TITLE', 'Dao')
    document.title = 'stale title'
    const mounted = render(<DocumentTitle productTitle="Dao" />)
    expect(document.title).toBe('Dao')
    mounted.rerender(<DocumentTitle title="First title" productTitle="Dao" />)
    expect(document.title).toBe('First title — Dao')
    mounted.rerender(<DocumentTitle title="Revised title" productTitle="Dao" />)
    expect(document.title).toBe('Revised title — Dao')
    mounted.rerender(<DocumentTitle productTitle="Dao" />)
    expect(document.title).toBe('Dao')
    mounted.unmount()
    expect(document.title).toBe('Dao')
  })

  it('uses the generic title when the build provides no title', () => {
    vi.stubEnv('DAO_CLIENT_TITLE', '')
    delete process.env.DAO_CLIENT_TITLE
    const mounted = render(<DocumentTitle title="First title" productTitle="DAO Local Build" />)
    expect(document.title).toBe('First title — DAO Local Build')
    mounted.unmount()
    expect(document.title).toBe('DAO Local Build')
  })
})
