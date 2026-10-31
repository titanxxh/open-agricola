import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import {
  animationsSettled, CATALOG, copiedLinks, detail, entryParam, entryUrl, expectCatalog, expectNoHorizontalOverflow,
  galleryEntries, LAYOUTS, LOBBY, newVisitor,
} from './helpers/encyclopedia'

const BASEBOARDS = entryUrl('card:A004_Baseboards')

for (const layout of LAYOUTS) {
  test.describe(layout.name, () => {
    let context: BrowserContext
    let page: Page

    test.beforeEach(async ({ browser }) => {
      ({ context, page } = await newVisitor(browser, layout, { clipboard: true }))
    })

    test.afterEach(async () => {
      await context.close()
    })

    test('A1 opens the catalog and a shared card without signing in or joining a room', async () => {
      await page.goto(CATALOG)
      await expectCatalog(page)
      await expect(galleryEntries(page).first()).toHaveAccessibleName('View Shelter')
      await expect(page.getByRole('textbox', { name: 'Username' })).toHaveCount(0)
      await expectNoHorizontalOverflow(page)

      await page.goto(BASEBOARDS)
      await expect(detail(page)).toHaveAccessibleName('Baseboards')
      expect(new URL(page.url()).searchParams.get('page')).toBe('encyclopedia')
      expect(new URL(page.url()).searchParams.has('room')).toBe(false)
    })

    test('A1 keeps the encyclopedia open when the auth API fails or never answers', async () => {
      await page.route('**/api/auth/me', route => route.abort('failed'))
      await page.goto(BASEBOARDS)
      await expect(detail(page)).toHaveAccessibleName('Baseboards')

      await page.unroute('**/api/auth/me')
      await page.route('**/api/auth/me', () => {})
      await page.goto(CATALOG)
      await expectCatalog(page)
    })

    test('P1 returns from a detail on the second page to the same page and scroll position', async () => {
      await page.goto(CATALOG)
      await expectCatalog(page)
      const firstPage = await galleryEntries(page).evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')))
      await page.screenshot({ path: test.info().outputPath('gallery.png') })

      await page.getByRole('button', { name: 'Next page' }).click()
      await expectCatalog(page, 2)
      const secondPage = await galleryEntries(page).evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')))
      expect(secondPage[0]).toBe('View Bassinet')
      expect(secondPage.filter(name => firstPage.includes(name))).toEqual([])

      const opener = page.getByRole('button', { name: 'View Swimming Class' })
      await opener.scrollIntoViewIfNeeded()
      const scrollY = await page.evaluate(() => window.scrollY)
      await opener.click()
      await expect(detail(page)).toHaveAccessibleName('Swimming Class')
      expect(entryParam(page)).toBe('card:A035_SwimmingClass')
      await animationsSettled(page)
      await page.screenshot({ path: test.info().outputPath('detail.png') })

      const box = await detail(page).boundingBox()
      const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth)
      expect(box).not.toBeNull()
      expect(box!.x + box!.width).toBe(viewportWidth)
      if (layout.phone) expect(box!.x).toBe(0)
      else expect(box!.width).toBeLessThan(viewportWidth / 2)

      await page.getByRole('button', { name: 'Close details' }).click()
      await expect(detail(page)).toBeHidden()
      expect(entryParam(page)).toBeNull()
      await expect(page.getByText(/^Page 2 of \d+$/)).toBeVisible()
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollY)
      await expect(opener).toBeFocused()
    })

    test('U2 Back returns to the results and Forward restores the detail', async () => {
      await page.goto(CATALOG)
      await galleryEntries(page).nth(3).click()
      await expect(detail(page)).toHaveAccessibleName('Baseboards')

      await page.goBack()
      await expect(detail(page)).toBeHidden()
      expect(entryParam(page)).toBeNull()
      await expectCatalog(page)

      await page.goForward()
      await expect(detail(page)).toHaveAccessibleName('Baseboards')
      expect(entryParam(page)).toBe('card:A004_Baseboards')
    })

    test('U2 closing a shared card lands on the whole catalog', async () => {
      await page.goto(BASEBOARDS)
      await expect(detail(page)).toHaveAccessibleName('Baseboards')

      await page.getByRole('button', { name: 'Back to results' }).click()

      await expect(detail(page)).toBeHidden()
      expect(new URL(page.url()).search).toBe('?page=encyclopedia')
      await expectCatalog(page)
    })

    test('U2 refresh clears the browse state but keeps a shared card open', async () => {
      await page.goto(CATALOG)
      await page.getByRole('button', { name: 'Next page' }).click()
      await expectCatalog(page, 2)

      await page.reload()
      await expectCatalog(page, 1)

      await galleryEntries(page).nth(3).click()
      await expect(detail(page)).toHaveAccessibleName('Baseboards')
      await page.reload()
      await expect(detail(page)).toHaveAccessibleName('Baseboards')

      await page.getByRole('button', { name: 'Close details' }).click()
      await expect(detail(page)).toBeHidden()
      expect(entryParam(page)).toBeNull()
      await expectCatalog(page)
    })

    test('U2 copies a link that carries only the page and the entry', async () => {
      await page.goto(`${CATALOG}&bg=winter-1`)
      await galleryEntries(page).nth(3).click()
      await page.getByRole('button', { name: 'Copy card link' }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Card link copied' })).toBeVisible()

      const [link] = await copiedLinks(page)
      const url = new URL(link)
      expect([...url.searchParams.entries()]).toEqual([['page', 'encyclopedia'], ['entry', 'card:A004_Baseboards']])

      await page.goto(link)
      await expect(detail(page)).toHaveAccessibleName('Baseboards')
    })

    test('U2 an unknown entry is reported as not in the encyclopedia', async () => {
      await page.goto(`${CATALOG}&entry=card%3AA004_Baseboard`)
      await expect(detail(page)).toHaveAccessibleName('Not in the encyclopedia')
      await expect(detail(page).getByText('Baseboards')).toHaveCount(0)

      await page.getByRole('button', { name: 'Back to catalog' }).click()
      expect(entryParam(page)).toBeNull()
      await expectCatalog(page)
    })

    test('E1 retries after the catalog fails to load', async () => {
      let failures = 1
      await page.route('**/card-encyclopedia/manifest.json*', route => (failures-- > 0 ? route.abort('failed') : route.continue()))
      await page.goto(CATALOG)

      const alert = page.getByRole('alert')
      await expect(alert).toContainText("Couldn't load the encyclopedia")
      await alert.getByRole('button', { name: 'Retry' }).click()

      await expectCatalog(page)
    })

    test('E1 keeps a text face when card art is missing', async () => {
      await page.route('**/deckA/A004.png*', route => route.fulfill({ status: 404, body: '' }))
      await page.goto(BASEBOARDS)

      const face = detail(page).locator('.encyclopedia-text-face')
      await expect(face.getByText('Image unavailable')).toBeVisible()
      await expect(face.getByRole('heading', { name: 'Baseboards' })).toBeVisible()
      await expect(face).toContainText('room')
      await animationsSettled(page)
      await page.screenshot({ path: test.info().outputPath('missing-art.png') })

      await page.getByRole('button', { name: 'Back to results' }).click()
      await expect(page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'View Baseboards' }) })
        .getByText('Image unavailable')).toBeVisible()
    })

    test('B1 ordinary pages do not request the encyclopedia', async () => {
      const requests: string[] = []
      page.on('request', request => requests.push(new URL(request.url()).pathname))
      await page.goto(LOBBY)
      await expect(page.getByRole('textbox', { name: 'Username' }).first()).toBeVisible()

      expect(requests.filter(path => /card-encyclopedia|\/encyclopedia\/|EncyclopediaPage/.test(path))).toEqual([])
    })
  })
}
