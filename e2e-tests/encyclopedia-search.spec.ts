import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { CATALOG, expectCatalog as expectCatalogPage, galleryEntries, galleryNames, LAYOUTS, newVisitor } from './helpers/encyclopedia'

const searchBox = (page: Page) => page.getByRole('searchbox')
const resultCount = (page: Page) => page.getByRole('heading', { name: /^Results: \d+$|^\d+ 条结果$/ })

async function expectCatalog(page: Page) {
  await expectCatalogPage(page)
  await expect(galleryEntries(page).first()).toHaveAccessibleName('View Shelter')
}

for (const layout of LAYOUTS) {
  test.describe(layout.name, () => {
    let context: BrowserContext
    let page: Page

    test.beforeEach(async ({ browser }) => {
      ({ context, page } = await newVisitor(browser, layout))
      await page.goto(CATALOG)
      await expectCatalog(page)
    })

    test.afterEach(async () => {
      await context.close()
    })

    test('Q1 finds English names and printed numbers in either interface language', async () => {
      await searchBox(page).fill('fireplace')
      await expect.poll(async () => (await galleryNames(page)).slice(0, 4))
        .toEqual(['View Fireplace', 'View Fireplace', 'View Fireplace', 'View Oriental Fireplace'])

      await searchBox(page).fill('a004')
      await expect(resultCount(page)).toHaveText('Results: 1')
      await expect(galleryEntries(page)).toHaveAccessibleName('View Baseboards')

      await searchBox(page).fill('FIREPLACE vegetable')
      await expect(resultCount(page)).toHaveText('Results: 5')
      expect(await galleryNames(page))
        .toEqual(['View Fireplace', 'View Fireplace', 'View Fireplace', 'View Vegetable Slicer', 'View Oriental Fireplace'])
      await page.screenshot({ path: test.info().outputPath('search-results.png') })

      await page.getByRole('button', { name: /^Display language/ }).click()
      await page.getByRole('option', { name: '简体中文' }).click()
      await expect(resultCount(page)).toHaveText('5 条结果')
      await expect(page.getByRole('searchbox', { name: '搜索卡牌' })).toHaveValue('FIREPLACE vegetable')
      await expect.poll(() => galleryNames(page)).toEqual(['查看 火炉', '查看 火炉', '查看 火炉', '查看 蔬果刨刀', '查看 东方火炉'])
    })

    test('Q1 waits for an input method to finish before searching', async ({ browserName }) => {
      test.skip(browserName !== 'chromium', 'Composes text through the Chromium DevTools protocol')
      const catalogCount = await resultCount(page).textContent()
      await searchBox(page).focus()
      const cdp = await context.newCDPSession(page)

      await cdp.send('Input.imeSetComposition', { text: 'mu', selectionStart: 2, selectionEnd: 2 })
      await cdp.send('Input.imeSetComposition', { text: 'mutou', selectionStart: 5, selectionEnd: 5 })
      await expect(searchBox(page)).toHaveValue('mutou')
      await expect(resultCount(page)).toHaveText(catalogCount!)
      await expect(galleryEntries(page)).toHaveCount(24)

      await cdp.send('Input.insertText', { text: '木头' })
      await expect(searchBox(page)).toHaveValue('木头')
      await expect(resultCount(page)).not.toHaveText(catalogCount!)
      await expect(galleryEntries(page).nth(2)).toHaveAccessibleName('View Baseboards')
    })

    test('Q2 finds icon text by 木头, 木材 and the English name, and every word must match', async () => {
      for (const [query, firstName] of [['木头', 'View Wood Harvester'], ['木材', 'View Wood Workshop']]) {
        await searchBox(page).fill(query)
        await expect(galleryEntries(page).first()).toHaveAccessibleName(firstName)
        await expect(galleryEntries(page).filter({ hasText: 'Baseboards' })).toHaveAccessibleName('View Baseboards')
      }

      await searchBox(page).fill('baseboards wood')
      await expect(resultCount(page)).toHaveText('Results: 1')
      await expect(galleryEntries(page)).toHaveAccessibleName('View Baseboards')

      await searchBox(page).fill('baseboards 木头 食物')
      await expect(page.getByRole('heading', { name: 'No matching cards' })).toBeVisible()
    })

    test('P1 a new query goes back to the first page', async () => {
      await page.getByRole('button', { name: 'Next page' }).click()
      await expect(page.getByText(/^Page 2 of \d+$/)).toBeVisible()

      await searchBox(page).fill('wood')

      await expect(page.getByText(/^Page 1 of \d+$/)).toBeVisible()
      await expect(galleryEntries(page).first()).toHaveAccessibleName('View Wooden Shed')
    })

    test('E1 keeps the query when nothing matches and clears it from the box or the empty results', async () => {
      await searchBox(page).fill('zzzz')
      await expect(page.getByRole('heading', { name: 'No matching cards' })).toBeVisible()
      await expect(resultCount(page)).toHaveText('Results: 0')
      await expect(searchBox(page)).toHaveValue('zzzz')
      await expect(page.getByRole('navigation', { name: 'Pagination' })).toHaveCount(0)
      await page.screenshot({ path: test.info().outputPath('no-results.png') })

      await page.getByRole('button', { name: 'Clear search', exact: true }).click()
      await expectCatalog(page)
      await expect(searchBox(page)).toHaveValue('')
      await expect(searchBox(page)).toBeFocused()

      await searchBox(page).fill('zzzz')
      await page.getByRole('button', { name: 'Clear search and filters' }).click()
      await expectCatalog(page)
      await expect(searchBox(page)).toHaveValue('')
    })
  })
}
