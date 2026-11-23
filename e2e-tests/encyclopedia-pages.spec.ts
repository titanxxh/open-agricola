// @covers client/app/encyclopedia/
// @covers client/encyclopedia-static/ scripts/vite-encyclopedia.ts scripts/build-frontend.ts
// @covers scripts/build-pages-encyclopedia.ts
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  copiedLinks, DESKTOP, detail, entryUrl, expectCatalog, expectNoHorizontalOverflow, expectResults, filterOption,
  filterPanel, filterSidebar, galleryEntries, lobbyReady, mainNavigation, MOBILE, newVisitor, selectedFilters, type Layout,
} from './helpers/encyclopedia'
import { buildPagesFrontend, PAGES_API_ORIGIN, servePagesFrontend } from './helpers/pages-frontend'

const ASSET_ORIGIN = 'https://titanxxh.github.io'
const CARD_ART = /\/assets\/.+\/([A-Z]+\d+)\.png$/
const ENCYCLOPEDIA_RUNTIME_CONTENT = /["'`]encyclopedia-[a-z-]+|\/card-encyclopedia\//

test.describe.configure({ mode: 'serial' })

let site: Awaited<ReturnType<typeof servePagesFrontend>>
let encyclopediaChunks: string[]
const catalogUrl = () => `${site.origin}/?page=encyclopedia`

test.beforeAll(async () => {
  test.setTimeout(900_000)
  const { directory } = buildPagesFrontend()
  const assets = join(directory, 'assets')
  // Shared bootstrap modules can name chunks; identify emitted UI and catalog code.
  encyclopediaChunks = readdirSync(assets).filter(file => file.endsWith('.js')
    && ENCYCLOPEDIA_RUNTIME_CONTENT.test(readFileSync(join(assets, file), 'utf8')))
  expect(encyclopediaChunks.length).toBeGreaterThan(0)
  site = await servePagesFrontend(directory)
})

test.afterAll(async () => {
  await site?.close()
})

/**
 * A signed-out visitor's API origin answers only like a live server for a signed-out browser (healthy, no session) and
 * fails every other request; a reachable artifact with an unreachable API is a server outage (#1816), which shows the
 * maintenance page instead. A signed-in visitor gets a stubbed account and empty lobby.
 */
async function visit(browser: Browser, layout: Layout, { signedIn = false } = {}) {
  const visitor = await newVisitor(browser, layout)
  await visitor.context.route(`${PAGES_API_ORIGIN}/**`, route => {
    const path = new URL(route.request().url()).pathname
    const headers = { 'access-control-allow-origin': site.origin, 'access-control-allow-credentials': 'true' }
    if (!signedIn) {
      if (path === '/api/health') return route.fulfill({ headers, json: { ok: true } })
      if (path === '/api/auth/me') return route.fulfill({ status: 401, headers, json: { ok: false, code: 'not_authenticated' } })
      return route.abort('failed')
    }
    return route.fulfill({
      headers,
      json: path === '/api/auth/me'
        ? { ok: true, user: { id: 'u1', username: 'reader', displayName: 'Reader' } }
        : { ok: true, rooms: [], games: [] },
    })
  })
  return visitor
}

type Observed = { url: URL; status?: number; failure?: string }

/** Every request the page makes, with its outcome once the browser has one. */
function observe(page: Page) {
  const seen = new Map<string, Observed>()
  const entry = (url: string) => {
    const observed = seen.get(url) ?? { url: new URL(url) }
    seen.set(url, observed)
    return observed
  }
  page.on('request', request => { entry(request.url()) })
  page.on('response', response => { entry(response.url()).status = response.status() })
  page.on('requestfailed', request => { entry(request.url()).failure = request.failure()?.errorText })
  const all = () => [...seen.values()]
  return {
    all,
    chunks: () => all().filter(({ url }) => url.origin === site.origin && url.pathname.startsWith('/assets/') && url.pathname.endsWith('.js'))
      .map(({ url }) => url.pathname.slice('/assets/'.length)),
    catalogData: () => all().filter(({ url }) => url.pathname.includes('/card-encyclopedia/')),
    cardArt: () => new Set(all().filter(({ url }) => url.origin === ASSET_ORIGIN)
      .map(({ url }) => CARD_ART.exec(url.pathname)?.[1]).filter((number): number is string => !!number)),
  }
}

const settled = (page: Page) => page.waitForLoadState('networkidle')
const standaloneUrl = () => `${site.origin}/encyclopedia/`
const standaloneCard = () => `${standaloneUrl()}?page=encyclopedia&entry=card%3AA004_Baseboards`

function observeStandalone(page: Page) {
  const requests = observe(page)
  const sockets: string[] = []
  page.on('websocket', socket => sockets.push(socket.url()))
  return {
    ...requests,
    async expectStatic() {
      expect(requests.all().filter(({ url }) =>
        ![site.origin, ASSET_ORIGIN].includes(url.origin) || /^\/(api|ws)(\/|$)/.test(url.pathname))).toEqual([])
      expect(sockets).toEqual([])
      expect(await page.context().cookies()).toEqual([])
    },
  }
}

const visibleNumbers = (page: Page) => page.locator('.encyclopedia-gallery__meta')
  .evaluateAll(metas => metas.map(meta => meta.textContent!.split(' · ')[0]!))

for (const layout of [DESKTOP, MOBILE]) {
  test.describe(`encyclopedia pages artifact ${layout.name.replace('encyclopedia ', '')}`, () => {
    const contexts: BrowserContext[] = []
    test.afterEach(async () => {
      await Promise.all(contexts.splice(0).map(context => context.close()))
    })

    test('A1 opens the catalog and a shared card from the site root without signing in', async ({ browser }, testInfo) => {
      const { context, page } = await visit(browser, layout)
      contexts.push(context)
      const requests = observe(page)

      await page.goto(catalogUrl())
      await expectCatalog(page)
      await expect(galleryEntries(page).first()).toHaveAccessibleName('View Shelter')
      await expect(page.getByRole('textbox', { name: 'Username' })).toHaveCount(0)
      await page.goto(entryUrl('card:A004_Baseboards', catalogUrl()))
      await expect(detail(page)).toHaveAccessibleName('Baseboards')
      await settled(page)
      await page.screenshot({ path: testInfo.outputPath('pages-detail.png') })
      expect(await context.cookies()).toEqual([])

      const sources = requests.all().map(({ url, status, failure }) => ({
        origin: url.origin, path: url.pathname, search: url.search, status, failure,
      }))
      writeFileSync(testInfo.outputPath('sources.json'), `${JSON.stringify(sources, null, 2)}\n`)
      await testInfo.attach('sources.json', { path: testInfo.outputPath('sources.json'), contentType: 'application/json' })
      const from = (match: (source: typeof sources[number]) => boolean) => sources.filter(match)
      const catalogData = from(({ path }) => path.startsWith('/card-encyclopedia/'))
      expect(catalogData.map(({ path }) => path.replace(/\.[a-f0-9]{16}\.json$/, '.json')).sort())
        .toEqual(expect.arrayContaining(['/card-encyclopedia/catalog.json', '/card-encyclopedia/manifest.json', '/card-encyclopedia/search.json']))
      const languages = from(({ path }) => path.startsWith('/i18n/'))
      // The Pages build carries the language list, so only the pack itself is read.
      expect(languages.map(({ path }) => path)).toEqual(expect.arrayContaining([expect.stringMatching(/^\/i18n\/en\.[a-f0-9]{16}\.json$/)]))
      expect(languages.map(({ path }) => path)).not.toContain('/i18n/manifest.json')
      const art = from(({ origin }) => origin === ASSET_ORIGIN)
      expect(art.map(({ path }) => path)).toContain('/open-agricola-assets/assets/revised/deckA/A004.png')
      for (const source of [...catalogData, ...languages]) expect(source).toMatchObject({ origin: site.origin, status: 200 })
      for (const source of art) expect(source.search).toBe('')
      expect(from(({ origin }) => ![site.origin, ASSET_ORIGIN, PAGES_API_ORIGIN].includes(origin))).toEqual([])
    })
  })
}

test.describe('encyclopedia pages artifact resources', () => {
  const contexts: BrowserContext[] = []
  test.afterEach(async () => {
    await Promise.all(contexts.splice(0).map(context => context.close()))
  })

  test('B1 ordinary pages request no encyclopedia chunk, catalog or card art until the visitor opens it', async ({ browser }) => {
    for (const signedIn of [false, true]) {
      const { context, page } = await visit(browser, DESKTOP, { signedIn })
      contexts.push(context)
      const requests = observe(page)
      await page.goto(`${site.origin}/`)
      if (signedIn) await lobbyReady(page)
      else await expect(page.getByRole('textbox', { name: 'Username' }).first()).toBeVisible()
      await settled(page)

      expect(requests.chunks().filter(chunk => encyclopediaChunks.includes(chunk))).toEqual([])
      expect(requests.catalogData()).toEqual([])
      expect([...requests.cardArt()]).toEqual([])
      expect(requests.all().filter(({ url }) => url.pathname.startsWith('/encyclopedia/'))).toEqual([])

      if (signedIn) await mainNavigation(page).getByRole('link', { name: 'Card Encyclopedia' }).click()
      else await page.goto(catalogUrl())
      await expectCatalog(page)
      expect(requests.chunks().filter(chunk => encyclopediaChunks.includes(chunk))).not.toEqual([])
      expect(requests.catalogData()).not.toEqual([])
    }
  })

  test('B1 the gallery requests card art for the page on screen only', async ({ browser }) => {
    const { context, page } = await visit(browser, DESKTOP)
    contexts.push(context)
    const requests = observe(page)
    await page.goto(catalogUrl())
    await expectCatalog(page)
    const firstPage = await visibleNumbers(page)
    await expect.poll(() => requests.cardArt().has('A004')).toBe(true)
    await settled(page)
    const firstArt = requests.cardArt()
    expect([...firstArt].filter(number => !firstPage.includes(number))).toEqual([])
    expect(firstArt.has('A035')).toBe(false)

    await page.getByRole('button', { name: 'Next page' }).click()
    await expectCatalog(page, 2)
    const secondPage = await visibleNumbers(page)
    await expect.poll(() => requests.cardArt().has('A035')).toBe(true)
    await settled(page)
    const secondArt = [...requests.cardArt()].filter(number => !firstArt.has(number))
    expect(secondArt.filter(number => !secondPage.includes(number))).toEqual([])
    expect(secondPage).toContain('A035')
  })

  test('E1 the artifact recovers from a failed catalog and keeps reading when art or a language pack fails', async ({ browser }) => {
    {
      const { context, page } = await visit(browser, DESKTOP)
      contexts.push(context)
      // Startup prefetches the catalog and the page loads it again, so the outage lasts until the reader retries.
      let available = false
      await page.route('**/card-encyclopedia/manifest.json*', route => (available ? route.continue() : route.abort('failed')))
      await page.goto(catalogUrl())
      const alert = page.getByRole('alert')
      await expect(alert).toContainText("Couldn't load the encyclopedia")
      available = true
      await alert.getByRole('button', { name: 'Retry' }).click()
      await expectCatalog(page)
    }
    {
      const { context, page } = await visit(browser, DESKTOP)
      contexts.push(context)
      await page.route(`${ASSET_ORIGIN}/**`, route => route.abort('failed'))
      await page.goto(catalogUrl())
      await expectCatalog(page)
      await expect(page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'View Baseboards' }) })
        .getByText('Image unavailable')).toBeVisible()
      await page.getByRole('button', { name: 'View Baseboards' }).click()
      const face = detail(page).locator('.encyclopedia-text-face')
      await expect(face.getByText('Image unavailable')).toBeVisible()
      await expect(face.getByRole('heading', { name: 'Baseboards' })).toBeVisible()
    }
    {
      const { context, page } = await visit(browser, DESKTOP)
      contexts.push(context)
      await page.route('**/i18n/zh.*.json', route => route.abort('failed'))
      await page.goto(catalogUrl())
      await expectCatalog(page)
      await page.getByRole('button', { name: /^Display language/ }).click()
      await page.getByRole('option', { name: '简体中文' }).click()
      await expect(page.getByRole('alert')).toHaveText('Unable to load the language. Please retry.')
      await expect(page.getByRole('heading', { level: 1, name: 'Card Encyclopedia' })).toBeVisible()
      await expect(galleryEntries(page).first()).toHaveAccessibleName('View Shelter')

      await page.unroute('**/i18n/zh.*.json')
      await page.getByRole('button', { name: /^Display language/ }).click()
      await page.getByRole('option', { name: '简体中文' }).click()
      await expect(page.getByRole('heading', { level: 1, name: '卡牌百科' })).toBeVisible()
      await expect(page.getByRole('alert')).toHaveCount(0)
    }
  })
})

for (const layout of [DESKTOP, MOBILE]) {
  test.describe(`standalone encyclopedia ${layout.name.replace('encyclopedia ', '')}`, () => {
    test('browses and shares a card without a game backend @webkit', async ({ browser }) => {
      const { context, page } = await newVisitor(browser, layout, { clipboard: true })
      try {
        const requests = observeStandalone(page)
        await page.goto(`${standaloneUrl()}?bg=none`, { waitUntil: 'domcontentloaded' })
        await expectCatalog(page)
        await expectNoHorizontalOverflow(page)
        await page.getByRole('button', { name: 'Next page' }).click()
        await expectCatalog(page, 2)

        const search = page.getByRole('searchbox', { name: 'Search cards' })
        await search.fill('A004')
        await expectResults(page, 1)
        if (layout.phone) {
          await page.getByRole('button', { name: 'Filters', exact: true }).click()
          await filterOption(filterPanel(page), 'Minor Improvement').check()
          await filterPanel(page).getByRole('button', { name: 'Show results (1)' }).click()
        } else {
          await filterOption(filterSidebar(page), 'Minor Improvement').check()
        }
        await expect(selectedFilters(page)).toHaveText(['Minor Improvement×'])
        const opener = page.getByRole('button', { name: 'View Baseboards' })
        await opener.focus()
        await opener.press('Enter')
        await expect(detail(page)).toHaveAccessibleName('Baseboards')
        await page.getByRole('button', { name: 'Copy card link' }).click()
        await expect(page.getByRole('status').filter({ hasText: 'Card link copied' })).toBeVisible()
        const links = await copiedLinks(page)
        expect(links).toEqual([standaloneCard()])
        await page.goBack()
        await expect(detail(page)).toBeHidden()
        await expect(opener).toBeFocused()
        await page.goForward()
        await expect(detail(page)).toHaveAccessibleName('Baseboards')
        await page.keyboard.press('Escape')
        await expect(detail(page)).toBeHidden()
        await expect(opener).toBeFocused()

        await page.getByRole('button', { name: /^Display language/ }).click()
        await page.getByRole('option', { name: '简体中文' }).click()
        await expect(page.getByRole('heading', { level: 1, name: '卡牌百科' })).toBeVisible()
        await expect(page.getByRole('button', { name: '查看 护壁板' })).toBeVisible()
        expect(requests.catalogData().map(({ url }) => url.pathname)).toEqual(expect.arrayContaining([
          '/encyclopedia/card-encyclopedia/manifest.json',
          expect.stringMatching(/^\/encyclopedia\/card-encyclopedia\/search\.[a-f0-9]{16}\.json$/),
        ]))
        await expect.poll(() => requests.cardArt().has('A004')).toBe(true)
        expect(await page.evaluate(() => navigator.serviceWorker.getRegistration())).toBeUndefined()
        await requests.expectStatic()

        const recipient = await newVisitor(browser, layout)
        try {
          const receivedRequests = observeStandalone(recipient.page)
          const [link] = links
          if (!link) throw new Error('The encyclopedia did not copy a share URL')
          await recipient.page.goto(link, { waitUntil: 'domcontentloaded' })
          await expect(detail(recipient.page)).toHaveAccessibleName('Baseboards')
          await recipient.page.reload({ waitUntil: 'domcontentloaded' })
          await expect(detail(recipient.page)).toHaveAccessibleName('Baseboards')
          await recipient.page.getByRole('button', { name: 'Close details' }).click()
          await expectCatalog(recipient.page)
          await receivedRequests.expectStatic()
          const lobbyLink = recipient.page.getByRole('link', { name: /Back to Lobby/i })
          await expect(lobbyLink).toBeVisible()
          await lobbyLink.click({ noWaitAfter: true })
          await expect(recipient.page).toHaveURL(`${site.origin}/`)
        } finally { await recipient.context.close() }
      } finally { await context.close() }
    })
  })
}

test.describe('standalone encyclopedia recovery', () => {
  test('recovers from a missing entry script, failed data and missing art @webkit', async ({ browser }) => {
    const { context, page } = await newVisitor(browser, DESKTOP)
    try {
      const requests = observeStandalone(page)
      for (const { pattern, message } of [
        { pattern: /\/encyclopedia\/assets\/[^/]+\.js$/, message: 'Unable to load card data.' },
        { pattern: /\/encyclopedia\/cards-manifest[^/]*\.json$/, message: 'Unable to load card data.' },
        { pattern: /\/encyclopedia\/i18n\/en-cards\.[a-f0-9]{16}\.json$/, message: 'Unable to load card data.' },
        { pattern: /\/encyclopedia\/card-encyclopedia\/manifest\.json$/, message: "Couldn't load the encyclopedia" },
      ]) {
        await page.route(pattern, route => route.fulfill({ status: 503, body: '' }))
        await page.goto(standaloneCard(), { waitUntil: 'domcontentloaded' })
        const alert = page.getByRole('alert')
        await expect(alert).toContainText(message)
        await page.unroute(pattern)
        await alert.getByRole('button', { name: 'Retry' }).click({ noWaitAfter: true })
        await expect(detail(page)).toHaveAccessibleName('Baseboards')
      }

      await page.route('**/deckA/A004.png', route => route.fulfill({ status: 404, body: '' }))
      await page.reload({ waitUntil: 'domcontentloaded' })
      const face = detail(page).locator('.encyclopedia-text-face')
      await expect(face.getByText('Image unavailable')).toBeVisible()
      await expect(face.getByRole('heading', { name: 'Baseboards' })).toBeVisible()
      await expect(face).toContainText('room')
      await requests.expectStatic()
    } finally { await context.close() }
  })

  test('opens a card under the installed root service worker @webkit', async ({ browser }) => {
    const { context, page } = await newVisitor(browser, DESKTOP)
    try {
      // Visit the old route once so the actual application registers the root worker.
      await page.goto(`${catalogUrl()}&bg=none`, { waitUntil: 'domcontentloaded' })
      await expect.poll(() => page.evaluate(async () =>
        (await navigator.serviceWorker.getRegistration())?.active?.state)).toBe('activated')
      await page.close()

      const reader = await context.newPage()
      const requests = observeStandalone(reader)
      await reader.goto(standaloneCard(), { waitUntil: 'domcontentloaded' })
      expect(await reader.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(`${site.origin}/sw.js`)
      await expect(detail(reader)).toHaveAccessibleName('Baseboards')
      await reader.reload({ waitUntil: 'domcontentloaded' })
      await expect(detail(reader)).toHaveAccessibleName('Baseboards')
      await requests.expectStatic()
    } finally { await context.close() }
  })
})
