import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { FRONTEND_URL } from './fixtures'

const CATALOG = `${FRONTEND_URL}/?page=encyclopedia`
const entryUrl = (key: string) => `${CATALOG}&entry=${encodeURIComponent(key)}`

const WORK_MARKET = { key: 'moorSpecialAction:moor-special-1-3-work-market', name: 'Fell Trees, Hiring Fair, Black Market, Illicit Work' }
const TERRAIN_1 = { key: 'moorStart:moor-start-1', name: 'Starting Terrain 1' }
const SUMMER = { key: 'season:summer', name: 'Summer' }

const TERRAIN_1_ROWS = [
  ['Moor', 'Moor', '', 'Forest', ''],
  ['', 'Moor', 'Forest', 'Forest', ''],
  ['', '', '', 'Forest', 'Forest'],
]

const LAYOUTS = [
  { name: 'encyclopedia desktop 1400x1000', viewport: { width: 1400, height: 1000 }, phone: false },
  { name: 'encyclopedia mobile 390x844', viewport: { width: 390, height: 844 }, phone: true },
] as const

type Layout = typeof LAYOUTS[number]

async function newVisitor(browser: Browser, layout: Layout): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: layout.viewport,
    ...(layout.phone ? { isMobile: true, hasTouch: true } : {}),
  })
  await context.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  return { context, page: await context.newPage() }
}

const detail = (page: Page) => page.getByRole('dialog')
const galleryItem = (page: Page, name: string) =>
  page.getByRole('listitem').filter({ has: page.getByRole('button', { name: `View ${name}`, exact: true }) })
const galleryFace = (page: Page, name: string) => galleryItem(page, name).locator('.encyclopedia-gallery__face')

async function animationsSettled(page: Page) {
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0)
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

/** Pages forward through the whole catalog until the entry shows up in the gallery. */
async function pageTo(page: Page, name: string) {
  const status = page.getByText(/^Page \d+ of \d+$/)
  await expect(status).toBeVisible()
  while (await galleryItem(page, name).count() === 0) {
    const before = await status.textContent()
    await page.getByRole('button', { name: 'Next page' }).click()
    await expect(status).not.toHaveText(before ?? '')
  }
  await galleryItem(page, name).scrollIntoViewIfNeeded()
}

async function expectImagesLoaded(images: Locator) {
  await expect.poll(() => images.evaluateAll(nodes => nodes.every(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)))
    .toBe(true)
}

const terrainRows = (scope: Locator) => scope.getByRole('table', { name: 'Starting terrain layout' }).getByRole('row')
  .evaluateAll(rows => rows.map(row => [...row.querySelectorAll('[role="cell"]')].map(cell => cell.getAttribute('aria-label') ?? '')))

/** Fails when part of the element is cut off by an ancestor that clips its overflow. */
async function expectUnclipped(element: Locator, container: Locator) {
  const [inner, outer] = await Promise.all([element.boundingBox(), container.boundingBox()])
  expect(inner).not.toBeNull()
  expect(outer).not.toBeNull()
  expect(inner!.x).toBeGreaterThanOrEqual(outer!.x - 0.5)
  expect(inner!.y).toBeGreaterThanOrEqual(outer!.y - 0.5)
  expect(inner!.x + inner!.width).toBeLessThanOrEqual(outer!.x + outer!.width + 0.5)
  expect(inner!.y + inner!.height).toBeLessThanOrEqual(outer!.y + outer!.height + 0.5)
}

for (const layout of LAYOUTS) {
  test.describe(layout.name, () => {
    let context: BrowserContext
    let page: Page

    test.beforeEach(async ({ browser }) => {
      ({ context, page } = await newVisitor(browser, layout))
    })

    test.afterEach(async () => {
      await context.close()
    })

    test('D2 shows moor special action, starting terrain and season faces in the gallery', async () => {
      await page.goto(CATALOG)
      await pageTo(page, WORK_MARKET.name)

      const specialFace = galleryFace(page, WORK_MARKET.name)
      const art = specialFace.locator('img.encyclopedia-moor-action-face__art')
      await expect(art).toBeVisible()
      await expect(art).toHaveAttribute('src', /moor-special-1-3-work-market\.webp/)
      await expectImagesLoaded(art)
      await expectUnclipped(art, specialFace)

      const terrainFace = galleryFace(page, TERRAIN_1.name)
      await expect(terrainFace.locator('.farm-terrain-sprite-forest')).toHaveCount(5)
      await expect(terrainFace.locator('.farm-terrain-sprite-moor')).toHaveCount(3)
      await expectUnclipped(terrainFace.locator('.encyclopedia-moor-start'), terrainFace)
      await expect(page.getByText('Image unavailable')).toHaveCount(0)
      await expectNoHorizontalOverflow(page)
      await animationsSettled(page)
      await page.screenshot({ path: test.info().outputPath('gallery-moor.png'), fullPage: true })

      await pageTo(page, SUMMER.name)
      const seasonFace = galleryFace(page, SUMMER.name)
      const actionCard = seasonFace.locator('.seasons-board__season-action-card')
      await expect(actionCard).toBeVisible()
      await expect(actionCard.locator('.seasons-board__action-header')).toHaveText("Farmer's Market")
      await expectUnclipped(actionCard, seasonFace)
      await expect(page.getByText('Image unavailable')).toHaveCount(0)
      await expectNoHorizontalOverflow(page)
      await animationsSettled(page)
      await page.screenshot({ path: test.info().outputPath('gallery-seasons.png'), fullPage: true })
    })

    test('D2 shows each special face with its printed details in the entry detail', async () => {
      await page.goto(entryUrl(WORK_MARKET.key))
      await expect(detail(page)).toHaveAccessibleName(WORK_MARKET.name)
      const card = detail(page).getByRole('group', { name: WORK_MARKET.name })
      await expect(card.getByText('1/3 players')).toBeVisible()
      await expect(card.getByRole('img', { name: 'Remove 1 forest to gain 2 wood' })).toBeVisible()
      await expect(card.getByText('3 players', { exact: true })).toBeVisible()
      await expect(card.getByRole('img', { name: 'Gain 2 food' })).toBeVisible()
      await expect(card.getByRole('button')).toHaveCount(0)
      await expectImagesLoaded(detail(page).locator('img.encyclopedia-moor-action-face__art'))
      await expectNoHorizontalOverflow(page)
      await animationsSettled(page)
      await page.screenshot({ path: test.info().outputPath('detail-moor-special.png') })

      await page.goto(entryUrl(TERRAIN_1.key))
      await expect(detail(page)).toHaveAccessibleName(TERRAIN_1.name)
      expect(await terrainRows(detail(page))).toEqual(TERRAIN_1_ROWS)
      await expect(detail(page).locator('.farm-terrain-sprite-forest').first()).toBeVisible()
      await expectNoHorizontalOverflow(page)
      await animationsSettled(page)
      await page.screenshot({ path: test.info().outputPath('detail-moor-start.png') })

      await page.goto(entryUrl(SUMMER.key))
      await expect(detail(page)).toHaveAccessibleName(SUMMER.name)
      const season = detail(page).getByRole('group', { name: SUMMER.name })
      await expect(season.locator('.seasons-board__action-header')).toHaveText("Farmer's Market")
      await expect(season.getByText('Plow 1 Field')).toBeVisible()
      await expect(season.locator('.seasons-board__resource-adjustment')).toHaveCount(4)
      await expect(season.getByText('Houses need no heating')).toBeVisible()
      await expectUnclipped(season.locator('.encyclopedia-season-face__changes'), season)
      await expect(detail(page).getByText('Image unavailable')).toHaveCount(0)
      await expectNoHorizontalOverflow(page)
      await animationsSettled(page)
      await page.screenshot({ path: test.info().outputPath('detail-season.png') })
    })

    test('E1 falls back to text faces when special card art is missing', async () => {
      await page.route('**/moor-special-1-3-work-market.webp*', route => route.fulfill({ status: 404, body: '' }))
      await page.route('**/moor/terrain/forest.webp*', route => route.fulfill({ status: 404, body: '' }))

      await page.goto(entryUrl(WORK_MARKET.key))
      const specialText = detail(page).locator('.encyclopedia-text-face')
      await expect(specialText.getByText('Image unavailable')).toBeVisible()
      await expect(specialText.getByRole('heading', { name: WORK_MARKET.name })).toBeVisible()
      await expect(detail(page).locator('img')).toHaveCount(0)

      await page.goto(entryUrl(TERRAIN_1.key))
      const terrainText = detail(page).locator('.encyclopedia-text-face')
      await expect(terrainText.getByText('Image unavailable')).toBeVisible()
      expect(await terrainRows(terrainText)).toEqual(TERRAIN_1_ROWS)
      await expect(terrainText.locator('.farm-terrain-sprite, .empty-node')).toHaveCount(0)
      await animationsSettled(page)
      await page.screenshot({ path: test.info().outputPath('missing-terrain-art.png') })

      await page.getByRole('button', { name: 'Back to results' }).click()
      await pageTo(page, TERRAIN_1.name)
      await expect(galleryItem(page, WORK_MARKET.name).getByText('Image unavailable')).toBeVisible()
      await expect(galleryItem(page, TERRAIN_1.name).getByText('Image unavailable')).toBeVisible()
      await expect(galleryItem(page, 'Fell Trees, Slash and Burn, Cut Peat').locator('img')).toBeVisible()
      await animationsSettled(page)
      await page.screenshot({ path: test.info().outputPath('missing-art-gallery.png'), fullPage: true })
    })
  })
}
