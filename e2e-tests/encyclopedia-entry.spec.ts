import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { FRONTEND_URL } from './fixtures'

const LOBBY = `${FRONTEND_URL}/`
const CATALOG = `${FRONTEND_URL}/?page=encyclopedia`

const LAYOUTS = [
  { name: 'encyclopedia desktop 1400x1000', viewport: { width: 1400, height: 1000 }, phone: false },
  { name: 'encyclopedia mobile 390x844', viewport: { width: 390, height: 844 }, phone: true },
] as const

type Layout = typeof LAYOUTS[number]

/** A fresh context has its own session storage; signed-in visitors get a stubbed account API. */
async function newVisitor(browser: Browser, layout: Layout, { signedIn }: { signedIn: boolean }) {
  const context = await browser.newContext({
    viewport: layout.viewport,
    ...(layout.phone ? { isMobile: true, hasTouch: true } : {}),
  })
  await context.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  if (signedIn) {
    await context.route('**/api/**', route => route.fulfill({
      json: new URL(route.request().url()).pathname === '/api/auth/me'
        ? { ok: true, user: { id: 'u1', username: 'reader', displayName: 'Reader' } }
        : { ok: true, rooms: [], games: [] },
    }))
  }
  return { context, page: await context.newPage() }
}

const galleryEntries = (page: Page) => page.getByRole('list')
  .filter({ has: page.getByRole('button', { name: /^View / }) })
  .getByRole('button', { name: /^View / })
const detail = (page: Page) => page.getByRole('dialog')
const mainNavigation = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' })
const lobbyReady = (page: Page) => expect(page.getByRole('button', { name: 'Create Multiplayer Game' })).toBeVisible()

async function expectCatalog(page: Page, pageNumber = 1) {
  await expect(page.getByRole('heading', { level: 1, name: 'Card Encyclopedia' })).toBeVisible()
  await expect(page.getByText(new RegExp(`^Page ${pageNumber} of \\d+$`))).toBeVisible()
  await expect(galleryEntries(page)).toHaveCount(24)
}

async function scrollTo(page: Page, top: number) {
  await page.evaluate(y => window.scrollTo(0, y), top)
  const scrollY = await page.evaluate(() => window.scrollY)
  expect(scrollY).toBeGreaterThan(0)
  return scrollY
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

for (const layout of LAYOUTS) {
  test.describe(layout.name, () => {
    const contexts: BrowserContext[] = []
    const visit = async (browser: Browser, signedIn: boolean) => {
      const visitor = await newVisitor(browser, layout, { signedIn })
      contexts.push(visitor.context)
      return visitor
    }

    test.afterEach(async () => {
      await Promise.all(contexts.splice(0).map(context => context.close()))
    })

    if (!layout.phone) {
      test('U1 opens the encyclopedia from the lobby header navigation', async ({ browser }) => {
        const { page } = await visit(browser, true)
        await page.goto(LOBBY)
        await lobbyReady(page)
        const entry = mainNavigation(page).getByRole('link', { name: 'Card Encyclopedia' })
        await expect(entry).toBeVisible()
        await expect(page.locator('.mobile-tab-bar')).toBeHidden()
        await page.locator('.lobby-header').screenshot({ path: test.info().outputPath('lobby-header.png') })
        await page.evaluate(() => { (window as unknown as { sameDocument: boolean }).sameDocument = true })

        await entry.click()

        await expectCatalog(page)
        expect(new URL(page.url()).search).toBe('?page=encyclopedia')
        expect(await page.evaluate(() => (window as unknown as { sameDocument?: boolean }).sameDocument)).toBe(true)
      })

      test('U2 keeps the page and scroll position after a full navigation to the lobby and back', async ({ browser }) => {
        const { page } = await visit(browser, true)
        await page.goto(CATALOG)
        await page.getByRole('button', { name: 'Next page' }).click()
        await expectCatalog(page, 2)
        const scrollY = await scrollTo(page, 700)

        await page.goto(LOBBY)
        await lobbyReady(page)
        await mainNavigation(page).getByRole('link', { name: 'Card Encyclopedia' }).click()

        await expectCatalog(page, 2)
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollY)

        await page.reload()
        await expectCatalog(page, 1)
      })

      test('U2 the lobby entry opened in a new tab starts from the first page', async ({ browser }) => {
        const { context, page } = await visit(browser, true)
        await page.goto(CATALOG)
        await page.getByRole('button', { name: 'Next page' }).click()
        await expectCatalog(page, 2)
        await page.getByRole('link', { name: 'Open Agricola: Back to Lobby' }).click()
        await lobbyReady(page)

        const [tab] = await Promise.all([
          context.waitForEvent('page'),
          mainNavigation(page).getByRole('link', { name: 'Card Encyclopedia' }).click({ modifiers: ['ControlOrMeta'] }),
        ])

        await expectCatalog(tab, 1)
        await lobbyReady(page)
      })
    } else {
      test('U1 opens the encyclopedia from the fourth tab of the main navigation', async ({ browser }) => {
        const { page } = await visit(browser, true)
        await page.goto(LOBBY)
        await lobbyReady(page)
        const tabs = mainNavigation(page).getByRole('button')
        await expect(tabs).toHaveText(['Lobby', 'Workshop', 'Cards', 'Settings'])
        await expect(page.locator('.lobby-header__nav')).toBeHidden()
        await expectNoHorizontalOverflow(page)
        await page.screenshot({ path: test.info().outputPath('lobby-tab-bar.png') })

        await mainNavigation(page).getByRole('button', { name: 'Cards' }).tap()

        await expectCatalog(page)
        await expect(mainNavigation(page).getByRole('button', { name: 'Cards' })).toHaveAttribute('aria-current', 'page')
        await expectNoHorizontalOverflow(page)
        await page.screenshot({ path: test.info().outputPath('encyclopedia-tab-bar.png') })
      })

      test('U1 signed-out visitors browse with the tab bar while the other tabs keep the login gate', async ({ browser }) => {
        const { page } = await visit(browser, false)
        await page.goto(CATALOG)
        await expectCatalog(page)
        await expect(mainNavigation(page).getByRole('button', { name: 'Cards' })).toHaveAttribute('aria-current', 'page')

        await page.getByRole('button', { name: 'Next page' }).click()
        await expectCatalog(page, 2)

        await mainNavigation(page).getByRole('button', { name: 'Lobby' }).tap()
        await expect(page.getByRole('textbox', { name: 'Username' }).first()).toBeVisible()
      })

      test('U1 keeps four tappable tabs without horizontal overflow at 320px', async ({ browser }) => {
        const { page } = await visit(browser, true)
        await page.setViewportSize({ width: 320, height: 700 })

        for (const url of [LOBBY, CATALOG]) {
          await page.goto(url)
          const tabs = mainNavigation(page).getByRole('button')
          await expect(tabs).toHaveCount(4)
          for (const tab of await tabs.all()) {
            const box = await tab.boundingBox()
            expect(box).not.toBeNull()
            expect(box!.x).toBeGreaterThanOrEqual(0)
            expect(box!.x + box!.width).toBeLessThanOrEqual(320)
            expect(box!.width).toBeGreaterThanOrEqual(44)
            expect(box!.height).toBeGreaterThanOrEqual(44)
            await tab.click({ trial: true })
          }
          await expectNoHorizontalOverflow(page)
        }
        await expectCatalog(page)
        await page.screenshot({ path: test.info().outputPath('encyclopedia-320.png') })
      })

      test('U2 keeps the page and scroll position after a round trip through the lobby tab', async ({ browser }) => {
        const { page } = await visit(browser, true)
        await page.goto(CATALOG)
        await page.getByRole('button', { name: 'Next page' }).click()
        await expectCatalog(page, 2)
        const scrollY = await scrollTo(page, 900)

        await mainNavigation(page).getByRole('button', { name: 'Lobby' }).tap()
        await lobbyReady(page)
        await mainNavigation(page).getByRole('button', { name: 'Cards' }).tap()

        await expectCatalog(page, 2)
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollY)

        await page.reload()
        await expectCatalog(page, 1)
      })
    }

    test('U2 a card refreshed from the second page stays open while the browse state starts over', async ({ browser }) => {
      const { page } = await visit(browser, false)
      await page.goto(CATALOG)
      await page.getByRole('button', { name: 'Next page' }).click()
      await expectCatalog(page, 2)
      await page.getByRole('button', { name: 'View Bassinet' }).click()
      await expect(detail(page)).toHaveAccessibleName('Bassinet')

      await page.reload()

      await expect(detail(page)).toHaveAccessibleName('Bassinet')
      await page.getByRole('button', { name: 'Close details' }).click()
      await expect(detail(page)).toBeHidden()
      await expectCatalog(page, 1)
    })

    test('U2 a new tab starts from the first page while the original tab keeps its page', async ({ browser }) => {
      const { context, page } = await visit(browser, false)
      await page.goto(CATALOG)
      await page.getByRole('button', { name: 'Next page' }).click()
      await expectCatalog(page, 2)

      const other = await context.newPage()
      await other.goto(CATALOG)

      await expectCatalog(other, 1)
      await page.goto(LOBBY)
      await page.goto(CATALOG)
      await expectCatalog(page, 2)
    })
  })
}
