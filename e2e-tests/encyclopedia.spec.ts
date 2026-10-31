import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { FRONTEND_URL } from './fixtures'
import {
  animationsSettled, CATALOG, copiedLinks, DESKTOP, detail, entryParam, entryUrl, expectCatalog, expectNoHorizontalOverflow,
  expectResults, filterOption, filterPanel, galleryEntries, LANDSCAPE, LAYOUTS, LOBBY, lobbyReady, mainNavigation, MOBILE,
  NARROW, newVisitor, selectedFilters, type Layout,
} from './helpers/encyclopedia'

const BASEBOARDS = entryUrl('card:A004_Baseboards')

/** Lobby entry, search, the filter panel, a detail and the way back, with screenshots of each stop. */
async function walkRepresentativePath(page: Page, layout: Layout) {
  const shot = (name: string) => page.screenshot({ path: test.info().outputPath(`${name}.png`) })
  await page.goto(LOBBY)
  await lobbyReady(page)
  if (layout.viewport.width <= 640) await mainNavigation(page).getByRole('button', { name: 'Cards' }).tap()
  else await mainNavigation(page).getByRole('link', { name: 'Card Encyclopedia' }).tap()
  await expectCatalog(page)
  await expectNoHorizontalOverflow(page)
  await shot('catalog')

  const search = page.getByRole('searchbox', { name: 'Search cards' })
  await search.fill('a004')
  await expectResults(page, 1)
  await expect(galleryEntries(page)).toHaveAccessibleName('View Baseboards')
  await search.fill('')
  await expectCatalog(page)

  const panel = filterPanel(page)
  await page.getByRole('button', { name: 'Filters', exact: true }).tap()
  await filterOption(panel, 'Mother').check()
  const confirm = panel.getByRole('button', { name: 'Show results (12)' })
  await expect(confirm).toBeInViewport({ ratio: 1 })
  await shot('filter-panel')
  await confirm.tap()
  await expect(panel).toBeHidden()
  await expectResults(page, 12)
  await expect(page.getByRole('button', { name: 'Filters (1)' })).toBeFocused()
  await expect(selectedFilters(page)).toHaveText(['Mother×'])
  await expectNoHorizontalOverflow(page)

  const opener = page.getByRole('button', { name: 'View Mother PR01' })
  await opener.tap()
  await expect(detail(page)).toHaveAccessibleName('Mother PR01')
  await animationsSettled(page)
  const box = (await detail(page).boundingBox())!
  expect(box.x + box.width).toBe(await page.evaluate(() => document.documentElement.clientWidth))
  await expect(detail(page).getByRole('button', { name: 'Close details' })).toBeInViewport({ ratio: 1 })
  await expectNoHorizontalOverflow(page)
  await shot('detail')

  await detail(page).getByRole('button', { name: 'Close details' }).tap()
  await expect(detail(page)).toBeHidden()
  await expect.poll(() => entryParam(page)).toBeNull()
  await expect(opener).toBeFocused()
  await expectResults(page, 12)
  await expect(selectedFilters(page)).toHaveText(['Mother×'])
  await expectNoHorizontalOverflow(page)
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')
type LanguageRef = { id: string; file: string; sha256: string }

/** Serves Chinese data in which one card text is still the English original, the way the build marks a fallback. */
async function serveEnglishFallback(page: Page, entryKey: string, messageKey: string) {
  const read = async (path: string) => {
    const response = await page.request.get(`${FRONTEND_URL}${path}`)
    expect(response.ok()).toBe(true)
    return response.json()
  }
  const languages: { languages: LanguageRef[] } = await read('/i18n/manifest.json')
  const english = await read(`/i18n/${languages.languages.find(language => language.id === 'en')!.file}`)
  const chineseRef = languages.languages.find(language => language.id === 'zh')!
  const chinese = await read(`/i18n/${chineseRef.file}`)
  chinese.messages[messageKey] = english.messages[messageKey]
  const chineseText = JSON.stringify(chinese)
  chineseRef.sha256 = sha256(chineseText)
  chineseRef.file = `zh.${chineseRef.sha256.slice(0, 16)}.json`
  await page.route('**/i18n/manifest.json*', route => route.fulfill({ json: languages }))
  await page.route(`**/i18n/${chineseRef.file}`, route => route.fulfill({ body: chineseText, contentType: 'application/json' }))

  const manifest = await read('/card-encyclopedia/manifest.json')
  const search = await read(`/card-encyclopedia/${manifest.search.file}`)
  const document = search.documents.find((candidate: { key: string }) => candidate.key === entryKey)
  document.locales.zh.body = { ...document.locales.en.body, status: 'fallback' }
  const searchText = JSON.stringify(search)
  manifest.search = { file: `search.${sha256(searchText).slice(0, 16)}.json`, sha256: sha256(searchText) }
  await page.route('**/card-encyclopedia/manifest.json*', route => route.fulfill({ json: manifest }))
  await page.route(`**/card-encyclopedia/${manifest.search.file}`, route => route.fulfill({ body: searchText, contentType: 'application/json' }))
}

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

test.describe(DESKTOP.name, () => {
  test('L1 marks a card text that is still English after switching to Chinese and drops the mark in English', async ({ browser }) => {
    const { context, page } = await newVisitor(browser, DESKTOP)
    try {
      await serveEnglishFallback(page, 'card:A004_Baseboards', 'cardFaces.A004_Baseboards.description')
      await page.goto(BASEBOARDS)
      await expect(detail(page)).toHaveAccessibleName('Baseboards')
      await expect(detail(page).getByText('Not translated; shown in English')).toHaveCount(0)
      await page.getByRole('button', { name: 'Close details' }).click()

      await page.getByRole('button', { name: /^Display language/ }).click()
      await page.getByRole('option', { name: '简体中文' }).click()
      await page.getByRole('button', { name: '查看 护壁板' }).click()
      await expect(detail(page)).toHaveAccessibleName('护壁板')
      const body = detail(page).getByRole('region', { name: '牌面文字' })
      await expect(body.getByText('此项暂无中文，显示英文')).toBeVisible()
      await expect(body).toContainText('You immediately get 1')
      await expect(detail(page).getByText('此项暂无中文，显示英文')).toHaveCount(1)
      await animationsSettled(page)
      await page.screenshot({ path: test.info().outputPath('english-fallback.png') })
      await page.getByRole('button', { name: '关闭详情' }).click()

      await page.getByRole('button', { name: /^界面语言/ }).click()
      await page.getByRole('option', { name: 'English' }).click()
      await page.getByRole('button', { name: 'View Baseboards' }).click()
      await expect(detail(page)).toHaveAccessibleName('Baseboards')
      await expect(detail(page).getByRole('region', { name: 'Card text' })).toContainText('You immediately get 1')
      await expect(detail(page).getByText('Not translated; shown in English')).toHaveCount(0)
    } finally { await context.close() }
  })
})

for (const layout of [NARROW, LANDSCAPE]) {
  test.describe(layout.name, () => {
    test('M1 walks from the lobby through search, filters and a detail and back', async ({ browser }) => {
      const { context, page } = await newVisitor(browser, layout, { signedIn: true })
      try { await walkRepresentativePath(page, layout) } finally { await context.close() }
    })
  })
}

for (const layout of [MOBILE, LANDSCAPE]) {
  test.describe(`${layout.name} webkit`, () => {
    test('M1 walks from the lobby through search, filters and a detail and back @webkit', async ({ browser, browserName }) => {
      test.skip(browserName !== 'webkit', 'Runs in the WebKit matrix')
      const { context, page } = await newVisitor(browser, layout, { signedIn: true })
      try { await walkRepresentativePath(page, layout) } finally { await context.close() }
    })
  })
}
