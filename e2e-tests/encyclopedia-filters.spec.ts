import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { FRONTEND_URL } from './fixtures'

const CATALOG = `${FRONTEND_URL}/?page=encyclopedia`

type Layout = { name: string; viewport: { width: number; height: number }; phone: boolean }

const DESKTOP: Layout = { name: 'encyclopedia desktop 1400x1000', viewport: { width: 1400, height: 1000 }, phone: false }
const MOBILE: Layout = { name: 'encyclopedia mobile 390x844', viewport: { width: 390, height: 844 }, phone: true }
const NARROW: Layout = { name: 'encyclopedia mobile 320x844', viewport: { width: 320, height: 844 }, phone: true }
const LANDSCAPE: Layout = { name: 'encyclopedia mobile 844x390', viewport: { width: 844, height: 390 }, phone: true }

async function newVisitor(browser: Browser, layout: Layout): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: layout.viewport,
    ...(layout.phone ? { isMobile: true, hasTouch: true } : {}),
  })
  await context.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  return { context, page: await context.newPage() }
}

const galleryEntries = (page: Page) => page.getByRole('list')
  .filter({ has: page.getByRole('button', { name: /^View / }) })
  .getByRole('button', { name: /^View / })
const galleryNames = (page: Page) => galleryEntries(page).evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')))
const resultsHeading = (page: Page) => page.getByRole('heading', { name: /^Results: \d+$/ })
const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Filters' })
const filterPanel = (page: Page) => page.getByRole('dialog', { name: 'Filter cards' })
const option = (scope: Locator, name: string) => scope.getByRole('checkbox', { name, exact: true })
const selectedFilters = (page: Page) => page.getByRole('group', { name: 'Selected filters' }).getByRole('listitem')

async function expectResults(page: Page, count: number) {
  await expect(page.getByRole('heading', { name: `Results: ${count}` })).toBeVisible()
}

async function openCatalog(page: Page) {
  await page.goto(CATALOG)
  await expect(resultsHeading(page)).toBeVisible()
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

async function tabTo(page: Page, target: Locator, limit = 120) {
  for (let presses = 0; presses < limit; presses++) {
    if (await target.evaluate(element => element === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error(`Tab never reached ${target}`)
}

test.describe(DESKTOP.name, () => {
  let context: BrowserContext
  let page: Page

  test.beforeEach(async ({ browser }) => {
    ({ context, page } = await newVisitor(browser, DESKTOP))
  })

  test.afterEach(async () => {
    await context.close()
  })

  test('F1 combines deck, printed cost, type and points filters and clearing restores the catalog', async () => {
    await openCatalog(page)
    const total = await resultsHeading(page).textContent()
    const firstPage = await galleryNames(page)
    await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeHidden()
    await page.getByRole('button', { name: 'Next page' }).click()
    await expect(page.getByText(/^Page 2 of \d+$/)).toBeVisible()
    const panel = sidebar(page)

    await option(panel, 'Deck A').check()
    await expectResults(page, 180)
    await expect(page.getByText('Page 1 of 8')).toBeVisible()
    await option(panel, 'Deck B').check()
    await expectResults(page, 360)
    await option(panel, 'Wood').check()
    await option(panel, 'Clay').check()
    await expectResults(page, 96)
    await option(panel, 'Occupation').check()
    await expectResults(page, 0)
    await option(panel, 'Occupation').uncheck()
    await option(panel, 'Minor Improvement').check()
    await expectResults(page, 96)
    await panel.getByRole('spinbutton', { name: 'Minimum fixed points' }).fill('1')
    await expectResults(page, 27)
    await panel.getByRole('spinbutton', { name: 'Maximum fixed points' }).fill('1')
    await expectResults(page, 22)
    await expect(selectedFilters(page)).toHaveText([
      'Deck A×', 'Deck B×', 'Minor Improvement×', 'Wood×', 'Clay×', 'Fixed points ≥ 1×', 'Fixed points ≤ 1×',
    ])
    await page.screenshot({ path: test.info().outputPath('desktop-filters.png') })

    await panel.getByRole('button', { name: 'Clear filters' }).click()

    await expect(resultsHeading(page)).toHaveText(total!)
    expect(await galleryNames(page)).toEqual(firstPage)
    await expect(selectedFilters(page)).toHaveCount(0)
    await expect(panel.getByRole('spinbutton', { name: 'Minimum fixed points' })).toHaveValue('')
  })

  test('F2 finds a card through either printed cost and never reads a missing cost as free', async () => {
    await openCatalog(page)
    const panel = sidebar(page)

    await option(panel, 'Deck A').check()
    await option(panel, 'Food').check()
    await expectResults(page, 11)
    await expect(page.getByRole('button', { name: 'View Baseboards' })).toBeVisible()
    await option(panel, 'Food').uncheck()
    await option(panel, 'Grain').check()
    await expectResults(page, 2)
    expect(await galleryNames(page)).toEqual(['View Baseboards', 'View Double-Turn Plow'])

    await panel.getByRole('button', { name: 'Clear filters' }).click()
    await option(panel, 'Upgrade by returning a card').check()
    await expectResults(page, 11)
    expect(await galleryNames(page)).toEqual([
      'View Oriental Fireplace', 'View Earth Oven', 'View Oven Installation', 'View Open Grill', 'View Horse Butchery',
      'View Living History Museum', 'View Cooking Hearth', 'View Cooking Hearth', 'View Cooking Hearth',
      'View Cookhouse', 'View Cookhouse',
    ])

    await panel.getByRole('button', { name: 'Clear filters' }).click()
    await option(panel, 'Occupation').check()
    await galleryEntries(page).first().click()
    const detail = page.getByRole('dialog', { name: 'Homekeeper' })
    await expect(detail).toContainText('No resource cost listed')
    await detail.getByRole('button', { name: 'Close details' }).click()
    await option(panel, 'Wood').check()
    await expectResults(page, 0)

    await panel.getByRole('button', { name: 'Clear filters' }).click()
    await option(panel, 'Mother').check()
    await page.getByRole('button', { name: 'View Mother PR01' }).click()
    await expect(page.getByRole('dialog', { name: 'Mother PR01' })).toContainText('Cost not applicable')
    await page.getByRole('button', { name: 'Close details' }).click()
    await option(panel, 'Food').check()
    await expectResults(page, 0)
  })

  test('F3 keeps negative decimal bounds, unlisted points and bonus marks apart', async () => {
    await openCatalog(page)
    const panel = sidebar(page)
    const minimum = panel.getByRole('spinbutton', { name: 'Minimum fixed points' })
    const maximum = panel.getByRole('spinbutton', { name: 'Maximum fixed points' })

    await minimum.fill('-0.75')
    await maximum.fill('-0.75')
    await expectResults(page, 1)
    expect(await galleryNames(page)).toEqual(['View Mother PR01'])
    await minimum.fill('-1')
    await maximum.fill('0')
    await expectResults(page, 14)
    await option(panel, 'Father').check()
    await expectResults(page, 0)
    await option(panel, 'No fixed points listed').check()
    await expectResults(page, 12)

    await panel.getByRole('button', { name: 'Clear filters' }).click()
    await option(panel, 'Major Improvement').check()
    await minimum.fill('2')
    await maximum.fill('2')
    await expectResults(page, 15)
    await option(panel, 'Marked with bonus points').check()
    await expectResults(page, 6)
    expect(await galleryNames(page)).toEqual([
      'View Basketmaker', 'View Joinery', 'View Pottery', 'View Basketmaker', 'View Joinery', 'View Pottery',
    ])
    await minimum.fill('')
    await maximum.fill('')
    await expectResults(page, 9)
    await expect(page.getByRole('button', { name: 'View Joinery' })).toHaveCount(2)
  })
})

test.describe(MOBILE.name, () => {
  let context: BrowserContext
  let page: Page

  test.beforeEach(async ({ browser }) => {
    ({ context, page } = await newVisitor(browser, MOBILE))
  })

  test.afterEach(async () => {
    await context.close()
  })

  test('U3 updates the results while the panel is open and keeps the conditions whichever way it closes', async () => {
    await openCatalog(page)
    await expect(sidebar(page)).toBeHidden()
    const panel = filterPanel(page)

    await page.getByRole('button', { name: 'Filters', exact: true }).click()
    await expect(panel).toBeVisible()
    await option(panel, 'Mother').check()
    await expect(panel.getByRole('button', { name: 'Show results (12)' })).toBeVisible()
    await option(panel, 'Season Rule').check()
    await expect(panel.getByRole('button', { name: 'Show results (16)' })).toBeVisible()
    await panel.getByRole('spinbutton', { name: 'Minimum fixed points' }).click()
    await page.keyboard.type('-0.5')
    await expect(panel.getByRole('button', { name: 'Show results (11)' })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('mobile-filter-panel.png') })

    await panel.getByRole('button', { name: 'Show results (11)' }).click()

    await expect(panel).toBeHidden()
    await expectResults(page, 11)
    await expect(page.getByRole('button', { name: 'Filters (3)' })).toBeFocused()
    await expect(selectedFilters(page)).toHaveText(['Mother×', 'Season Rule×', 'Fixed points ≥ -0.5×'])
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: test.info().outputPath('mobile-filtered.png') })

    await page.getByRole('button', { name: 'Filters (3)' }).click()
    await expect(panel.getByRole('spinbutton', { name: 'Minimum fixed points' })).toHaveValue('-0.5')
    await panel.getByRole('spinbutton', { name: 'Maximum fixed points' }).click()
    await page.keyboard.type('-0.25')
    await expect(panel.getByRole('button', { name: 'Show results (1)' })).toBeVisible()
    await panel.getByRole('button', { name: 'Close filters' }).click()

    await expect(panel).toBeHidden()
    await expectResults(page, 1)
    expect(await galleryNames(page)).toEqual(['View Mother PR02'])

    await page.getByRole('button', { name: 'Filters (4)' }).click()
    await option(panel, 'Season Rule').uncheck()
    await page.keyboard.press('Escape')

    await expect(panel).toBeHidden()
    await expect(page.getByRole('button', { name: 'Filters (3)' })).toBeFocused()
    await expect(selectedFilters(page)).toHaveText(['Mother×', 'Fixed points ≥ -0.5×', 'Fixed points ≤ -0.25×'])
    await expectResults(page, 1)
  })

  test('U3 completes filtering with the keyboard alone', async () => {
    await openCatalog(page)
    const panel = filterPanel(page)

    await tabTo(page, page.getByRole('button', { name: 'Filters', exact: true }))
    await page.keyboard.press('Enter')
    await expect(panel).toBeVisible()
    await tabTo(page, option(panel, 'Deck B'))
    await page.keyboard.press('Space')
    await expect(panel.getByRole('button', { name: 'Show results (180)' })).toBeVisible()
    await tabTo(page, panel.getByRole('spinbutton', { name: 'Minimum fixed points' }))
    await page.keyboard.type('-1')
    await expect(panel.getByRole('button', { name: 'Show results (23)' })).toBeVisible()
    await tabTo(page, panel.getByRole('button', { name: 'Show results (23)' }))
    await page.keyboard.press('Enter')

    await expect(panel).toBeHidden()
    await expect(page.getByRole('button', { name: 'Filters (2)' })).toBeFocused()
    await expectResults(page, 23)

    await tabTo(page, page.getByRole('button', { name: 'Remove filter: Deck B' }))
    await page.keyboard.press('Enter')

    await expectResults(page, 218)
    await expect(page.getByRole('button', { name: 'Remove filter: Fixed points ≥ -1' })).toBeFocused()
  })
})

test.describe(NARROW.name, () => {
  let context: BrowserContext
  let page: Page

  test.beforeEach(async ({ browser }) => {
    ({ context, page } = await newVisitor(browser, NARROW))
  })

  test.afterEach(async () => {
    await context.close()
  })

  test('U3 fits the filter panel and the selected filters into 320px without horizontal scrolling', async () => {
    await openCatalog(page)
    const panel = filterPanel(page)

    await page.getByRole('button', { name: 'Filters', exact: true }).click()
    await option(panel, 'Standard Major Improvements').check()
    await option(panel, '5–6 Player Major Improvements').check()
    await option(panel, 'Upgrade by returning a card').check()
    await panel.getByRole('spinbutton', { name: 'Minimum fixed points' }).fill('-0.75')
    await panel.getByRole('spinbutton', { name: 'Maximum fixed points' }).fill('1.5')
    await expect(panel.getByRole('button', { name: 'Show results (3)' })).toBeVisible()
    const panelOverflow = await panel.locator('.encyclopedia-filter-dialog__body')
      .evaluate(body => body.scrollWidth - body.clientWidth)
    expect(panelOverflow).toBeLessThanOrEqual(0)
    await expect(panel.getByRole('button', { name: 'Close filters' })).toBeInViewport({ ratio: 1 })
    await expect(panel.getByRole('button', { name: 'Show results (3)' })).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: test.info().outputPath('narrow-filter-panel.png') })

    await panel.getByRole('button', { name: 'Show results (3)' }).click()

    await expectResults(page, 3)
    await expect(selectedFilters(page)).toHaveCount(5)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: test.info().outputPath('narrow-filtered.png') })
  })
})

test.describe(LANDSCAPE.name, () => {
  let context: BrowserContext
  let page: Page

  test.beforeEach(async ({ browser }) => {
    ({ context, page } = await newVisitor(browser, LANDSCAPE))
  })

  test.afterEach(async () => {
    await context.close()
  })

  test('U3 keeps closing and showing results reachable in a short landscape panel', async () => {
    await openCatalog(page)
    await expect(sidebar(page)).toBeHidden()
    const panel = filterPanel(page)

    await page.getByRole('button', { name: 'Filters', exact: true }).click()
    const close = panel.getByRole('button', { name: 'Close filters' })
    const confirm = panel.getByRole('button', { name: /^Show results \(\d+\)$/ })
    await expect(close).toBeInViewport({ ratio: 1 })
    await expect(confirm).toBeInViewport({ ratio: 1 })

    await option(panel, 'Marked with bonus points').check()

    await expect(confirm).toHaveText('Show results (135)')
    await expect(close).toBeInViewport({ ratio: 1 })
    await expect(confirm).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: test.info().outputPath('landscape-filter-panel.png') })

    await confirm.click()

    await expectResults(page, 135)
    await expect(page.getByRole('button', { name: 'Filters (1)' })).toBeFocused()
    await expectNoHorizontalOverflow(page)
  })
})
