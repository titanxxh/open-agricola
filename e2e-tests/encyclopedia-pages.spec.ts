import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DESKTOP, detail, entryUrl, expectCatalog, galleryEntries, lobbyReady, mainNavigation, MOBILE, newVisitor, type Layout,
} from './helpers/encyclopedia'
import { buildPagesFrontend, PAGES_API_ORIGIN, servePagesFrontend } from './helpers/pages-frontend'

const ASSET_ORIGIN = 'https://titanxxh.github.io'
const ASSET_VERSION = readFileSync('public-assets.ref', 'utf8').trim()
const CARD_ART = /\/assets\/.+\/([A-Z]+\d+)\.png$/

test.describe.configure({ mode: 'serial' })

let site: Awaited<ReturnType<typeof servePagesFrontend>>
let encyclopediaChunks: string[]
const catalogUrl = () => `${site.origin}/?page=encyclopedia`

test.beforeAll(async () => {
  test.setTimeout(900_000)
  const { directory } = buildPagesFrontend()
  const assets = join(directory, 'assets')
  encyclopediaChunks = readdirSync(assets).filter(file => file.endsWith('.js')
    && (/encyclopedia/i.test(file) || /encyclopedia-gallery|encyclopedia-load-error|card-encyclopedia\//.test(readFileSync(join(assets, file), 'utf8'))))
  expect(encyclopediaChunks.length).toBeGreaterThan(0)
  site = await servePagesFrontend(directory)
})

test.afterAll(async () => {
  await site?.close()
})

/** Nothing answers at the artifact's API origin; a signed-in visitor gets a stubbed account and empty lobby. */
async function visit(browser: Browser, layout: Layout, { signedIn = false } = {}) {
  const visitor = await newVisitor(browser, layout)
  await visitor.context.route(`${PAGES_API_ORIGIN}/**`, route => {
    if (!signedIn) return route.abort('failed')
    const path = new URL(route.request().url()).pathname
    return route.fulfill({
      headers: { 'access-control-allow-origin': site.origin, 'access-control-allow-credentials': 'true' },
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
        origin: url.origin, path: url.pathname, version: url.searchParams.get('v'), status, failure,
      }))
      writeFileSync(testInfo.outputPath('sources.json'), `${JSON.stringify(sources, null, 2)}\n`)
      await testInfo.attach('sources.json', { path: testInfo.outputPath('sources.json'), contentType: 'application/json' })
      const from = (match: (source: typeof sources[number]) => boolean) => sources.filter(match)
      const catalogData = from(({ path }) => path.startsWith('/card-encyclopedia/'))
      expect(catalogData.map(({ path }) => path.replace(/\.[a-f0-9]{16}\.json$/, '.json')).sort())
        .toEqual(expect.arrayContaining(['/card-encyclopedia/catalog.json', '/card-encyclopedia/manifest.json', '/card-encyclopedia/search.json']))
      const languages = from(({ path }) => path.startsWith('/i18n/'))
      expect(languages.map(({ path }) => path)).toEqual(expect.arrayContaining(['/i18n/manifest.json', expect.stringMatching(/^\/i18n\/en\.[a-f0-9]{16}\.json$/)]))
      const art = from(({ origin }) => origin === ASSET_ORIGIN)
      expect(art.map(({ path }) => path)).toContain('/open-agricola-assets/assets/revised/deckA/A004.png')
      for (const source of [...catalogData, ...languages]) expect(source).toMatchObject({ origin: site.origin, status: 200 })
      for (const source of art) expect(source.version).toBe(ASSET_VERSION)
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
      let failures = 1
      await page.route('**/card-encyclopedia/manifest.json*', route => (failures-- > 0 ? route.abort('failed') : route.continue()))
      await page.goto(catalogUrl())
      const alert = page.getByRole('alert')
      await expect(alert).toContainText("Couldn't load the encyclopedia")
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
