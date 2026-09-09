// Keyless rendered acceptance coverage for the Mission Control shell. The
// cold seed carries a completed Goal and enough durable activity to project
// squad XP, so every assertion runs without a model or network dependency.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  acknowledgeReloadConnectionLoss, launchWebScaffold, seedSession, watchConsole, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const FIXTURE = fileURLToPath(new URL('../../../snapshots/web/goal-multi-turn-actions/session.jsonl', import.meta.url))
const SEED_ID = 'mission-control-seed'
const WIDTHS = [1_440, 1_180, 760, 390, 320] as const

/** Open the only cold seeded Session below its group row. */
async function openSeededSession(page: Page): Promise<void> {
  const group = page.locator('[role="treeitem"]').first()
  await group.waitFor({ timeout: 15_000 })
  if (await group.getAttribute('aria-expanded') !== 'true') await group.click()
  const session = page.locator('[role="treeitem"]').nth(1)
  await session.waitFor({ timeout: 15_000 })
  await session.click()
  await page.getByRole('region', { name: 'Current mission' }).waitFor({ timeout: 15_000 })
}

/** AppFrame is the only product element with inline grid track columns. */
function appFrame(page: Page) {
  return page.locator('[style*="grid-template-columns"]').first()
}

describe('web e2e: Mission Control remains usable across its responsive matrix', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    await seedSession(scaffold, await readFile(FIXTURE, 'utf8'), SEED_ID)
    browser = await chromium.launch()
    page = await newEnglishPage(browser, 900)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await appFrame(page).waitFor({ timeout: 30_000 })
    await openSeededSession(page)
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('renders real mission and squad state and preserves the collapsible panels', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-mission-control-state'))
    const mission = page.getByRole('region', { name: 'Current mission' })
    expect(await mission.getByText('Complete Goal', { exact: true }).count()).toBe(1)
    expect(await mission.getByText('2 of 256 rounds', { exact: true }).count()).toBe(1)
    expect(await mission.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('2')

    const squad = page.getByRole('button', { name: 'Squad progress: level 2, 11 XP' })
    await squad.click()
    await page.getByText('Squad progress', { exact: true }).last().waitFor({ timeout: 10_000 })
    await expect.poll(() => appFrame(page).getAttribute('data-details-collapsed'), { timeout: 5_000 }).toBeNull()
    expect(await page.getByText('Level 2', { exact: true }).last().isVisible()).toBe(true)
    expect(await page.getByText('11 XP', { exact: true }).last().isVisible()).toBe(true)
    await page.getByRole('button', { name: 'Close squad progress' }).click()
    await expect.poll(() => appFrame(page).getAttribute('data-details-collapsed'), { timeout: 5_000 }).toBe('true')

    const collapse = page.getByRole('button', { name: 'Collapse sidebar' })
    await collapse.focus()
    expect(await collapse.evaluate(element => Number.parseFloat(getComputedStyle(element).outlineWidth)))
      .toBeGreaterThanOrEqual(2)
    await collapse.click()
    await expect.poll(() => appFrame(page).getAttribute('data-sidebar-collapsed'), { timeout: 5_000 }).toBe('true')
    await page.getByRole('button', { name: 'Open sidebar' }).click()
    await expect.poll(() => appFrame(page).getAttribute('data-sidebar-collapsed'), { timeout: 5_000 }).toBeNull()
  }, 60_000)

  it('defaults to light, persists the header toggle, and exposes its focus ring', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-mission-control-theme'))
    expect(await page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme'))).toBe(false)
    const darkToggle = page.getByRole('button', { name: 'Switch to dark theme' })
    await darkToggle.focus()
    expect(await darkToggle.evaluate(element => Number.parseFloat(getComputedStyle(element).outlineWidth)))
      .toBeGreaterThanOrEqual(2)
    await darkToggle.click()
    await expect.poll(() => page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme')), {
      timeout: 5_000,
    }).toBe(true)

    const warningStart = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    await page.getByRole('button', { name: 'Switch to light theme' }).waitFor({ timeout: 30_000 })
    expect(await page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme'))).toBe(true)
    await page.getByRole('button', { name: 'Switch to light theme' }).click()
    await expect.poll(() => page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme')), {
      timeout: 5_000,
    }).toBe(false)
  }, 60_000)

  it('has no page overflow at every target width and honors reduced motion', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-mission-control-responsive'))
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      await expect.poll(() => page.evaluate(() => Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) - window.innerWidth), { timeout: 10_000 }).toBeLessThanOrEqual(1)
      expect(await page.getByRole('region', { name: 'Current mission' }).isVisible()).toBe(true)
    }

    const squadTrack = page.locator('.squad-header-chip').locator(':scope > span').nth(2)
    expect(await squadTrack.evaluate(element => getComputedStyle(element).display)).toBe('none')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const missionFill = page.locator('[data-goal-mission] [role="progressbar"] > span')
    expect(await missionFill.evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s')
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 60_000)
})
