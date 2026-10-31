import { expect, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { FRONTEND_URL } from '../fixtures'

export const LOBBY = `${FRONTEND_URL}/`
export const CATALOG = `${FRONTEND_URL}/?page=encyclopedia`
export const entryUrl = (key: string, catalog = CATALOG) => `${catalog}&entry=${encodeURIComponent(key)}`

export type Layout = { name: string; viewport: { width: number; height: number }; phone: boolean }

export const DESKTOP: Layout = { name: 'encyclopedia desktop 1400x1000', viewport: { width: 1400, height: 1000 }, phone: false }
export const MOBILE: Layout = { name: 'encyclopedia mobile 390x844', viewport: { width: 390, height: 844 }, phone: true }
export const NARROW: Layout = { name: 'encyclopedia mobile 320x844', viewport: { width: 320, height: 844 }, phone: true }
export const LANDSCAPE: Layout = { name: 'encyclopedia mobile 844x390', viewport: { width: 844, height: 390 }, phone: true }
export const LAYOUTS = [DESKTOP, MOBILE]

declare global {
  interface Window { __copiedLinks: string[] }
}

/**
 * A fresh context has no session cookie and its own session storage, so every visitor
 * starts signed out on the first page. Signed-in visitors get a stubbed account API.
 */
export async function newVisitor(
  browser: Browser,
  layout: Layout,
  { signedIn = false, clipboard = false }: { signedIn?: boolean; clipboard?: boolean } = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: layout.viewport,
    ...(layout.phone ? { isMobile: true, hasTouch: true } : {}),
  })
  await context.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  if (clipboard) {
    await context.addInitScript(() => {
      const copied: string[] = []
      Object.defineProperty(window, '__copiedLinks', { value: copied })
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text: string) => { copied.push(text) } },
      })
    })
  }
  if (signedIn) {
    await context.route('**/api/**', route => route.fulfill({
      json: new URL(route.request().url()).pathname === '/api/auth/me'
        ? { ok: true, user: { id: 'u1', username: 'reader', displayName: 'Reader' } }
        : { ok: true, rooms: [], games: [] },
    }))
  }
  expect(await context.cookies()).toEqual([])
  return { context, page: await context.newPage() }
}

export const copiedLinks = (page: Page) => page.evaluate(() => window.__copiedLinks)

const VIEW = /^(View|查看) /
export const galleryEntries = (page: Page) => page.getByRole('list')
  .filter({ has: page.getByRole('button', { name: VIEW }) })
  .getByRole('button', { name: VIEW })
export const galleryNames = (page: Page) => galleryEntries(page)
  .evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')))
export const detail = (page: Page) => page.getByRole('dialog')
export const entryParam = (page: Page) => new URL(page.url()).searchParams.get('entry')
export const resultsHeading = (page: Page) => page.getByRole('heading', { name: /^Results: \d+$/ })
export const filterSidebar = (page: Page) => page.getByRole('complementary', { name: 'Filters' })
export const filterPanel = (page: Page) => page.getByRole('dialog', { name: 'Filter cards' })
export const filterOption = (scope: Locator, name: string) => scope.getByRole('checkbox', { name, exact: true })
export const selectedFilters = (page: Page) => page.getByRole('group', { name: 'Selected filters' }).getByRole('listitem')
export const mainNavigation = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' })
export const lobbyReady = (page: Page) => expect(page.getByRole('button', { name: 'Create Multiplayer Game' })).toBeVisible()

export async function expectCatalog(page: Page, pageNumber = 1) {
  await expect(page.getByRole('heading', { level: 1, name: 'Card Encyclopedia' })).toBeVisible()
  await expect(resultsHeading(page)).toBeVisible()
  await expect(page.getByText(new RegExp(`^Page ${pageNumber} of \\d+$`))).toBeVisible()
  await expect(galleryEntries(page)).toHaveCount(24)
}

export async function expectResults(page: Page, count: number) {
  await expect(page.getByRole('heading', { name: `Results: ${count}` })).toBeVisible()
}

export async function animationsSettled(page: Page) {
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0)
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

export async function scrollTo(page: Page, top: number) {
  await page.evaluate(y => window.scrollTo(0, y), top)
  const scrollY = await page.evaluate(() => window.scrollY)
  expect(scrollY).toBeGreaterThan(0)
  return scrollY
}

export async function tabTo(page: Page, target: Locator, limit = 120) {
  for (let presses = 0; presses < limit; presses++) {
    if (await target.evaluate(element => element === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error(`Tab never reached ${target}`)
}
