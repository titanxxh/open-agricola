// @covers client/service-worker/app-shell.worker.ts
// @covers scripts/vite-service-worker.ts
// @covers scripts/browser-data.ts client/services/language-pack.ts client/app/CardTextBoundary.tsx
// @covers client/main.tsx client/app/startup-prefetch.ts client/app/platform-page.ts client/services/app-shell-warm.ts
import { expect, test, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { galleryEntries } from './helpers/encyclopedia'
import { buildPagesFrontend, servePagesFrontend } from './helpers/pages-frontend'

const CACHE_NAME = 'open-agricola-app-shell-v1'
const documentLoad = { waitUntil: 'domcontentloaded' } as const
const CONTENT_TYPES: Readonly<Record<string, string>> = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }

let directory: string
let siteDirectory: string
let site: Awaited<ReturnType<typeof servePagesFrontend>>
const requests: string[] = []
const tampered = new Set<string>()
let releaseCardText: (() => void) | undefined
let cardTextHeld: Promise<void> | undefined
let releaseCore: (() => void) | undefined
let coreHeld: Promise<void> | undefined

test.describe.configure({ mode: 'serial', timeout: 180_000 })
test.skip(({ browserName }) => browserName === 'firefox', 'This release verifies Chromium and WebKit')

test.beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'oa-app-shell-worker-'))
  siteDirectory = join(directory, 'pages')
  mkdirSync(siteDirectory)
  // No HTTP caching, so every repeat load that skips the origin can only have come from the Worker.
  site = await servePagesFrontend(siteDirectory, undefined, (request, response) => {
    const path = new URL(request.url ?? '/', 'http://pages.invalid').pathname
    if (request.method === 'GET') requests.push(path)
    if (!/^\/(assets\/|i18n\/|cards-manifest\.|card-encyclopedia\/)/.test(path)) return false
    let bytes: Buffer
    try { bytes = readFileSync(join(siteDirectory, path)) } catch { return false }
    if (tampered.has(path)) bytes = Buffer.concat([bytes, Buffer.from('\n/* altered in transit */\n')])
    const send = () => {
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
      response.end(bytes)
    }
    if (cardTextHeld && /^\/i18n\/[a-z-]+-cards\.[a-f0-9]{16}\.json$/.test(path)) void cardTextHeld.then(send)
    else if (coreHeld && /^\/i18n\/[a-z-]+\.[a-f0-9]{16}\.json$/.test(path)) void coreHeld.then(send)
    else send()
    return true
  })
  cpSync(buildPagesFrontend(site.origin).directory, siteDirectory, { recursive: true })
})

test.afterEach(async ({ context }) => {
  // A Worker keeps warming in the background; close it and let its last requests land before the next test logs any.
  await context.close()
  for (let seen = -1, quiet = 0; quiet < 10 && seen !== Infinity;) {
    await new Promise(resolve => setTimeout(resolve, 100))
    quiet = requests.length === seen ? quiet + 1 : 0
    seen = requests.length
  }
  requests.length = 0
  tampered.clear()
  releaseCardText?.()
  cardTextHeld = undefined
  releaseCore?.()
  coreHeld = undefined
})

test.afterAll(async () => {
  await site?.close()
  if (directory) rmSync(directory, { recursive: true, force: true })
})

const STARTUP_DATA = /^\/(i18n\/zh\.[a-f0-9]{16}\.json|cards-manifest\.[a-f0-9]{64}\.json|card-encyclopedia\/(catalog|search)\.[a-f0-9]{16}\.json)$/

/** The Chinese language pack, the cards manifest and the encyclopedia data: the content-addressed files the encyclopedia loads. */
function startupData(): string[] {
  const files = [...readdirSync(join(siteDirectory, 'i18n')).map(name => `/i18n/${name}`), ...readdirSync(siteDirectory).map(name => `/${name}`),
    ...readdirSync(join(siteDirectory, 'card-encyclopedia')).map(name => `/card-encyclopedia/${name}`)]
  return files.filter(path => STARTUP_DATA.test(path)).sort()
}

// The encyclopedia renders before any API check, so this static site exercises the full startup path there.
async function controlledEncyclopedia(page: Page) {
  await page.addInitScript(() => { localStorage.setItem('open-agricola-locale-v2', 'zh') })
  await page.goto(`${site.origin}/?page=encyclopedia&bg=none`, documentLoad)
  await expect.poll(() => page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistration())?.active?.state)).toBe('activated')
  // Let the uncontrolled page finish, so none of its late requests count as the controlled load's.
  await encyclopediaReady(page)
  // Only the controlled load matters: it is the one the Worker serves and caches.
  requests.length = 0
  await page.reload(documentLoad)
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(`${site.origin}/sw.js`)
  await encyclopediaReady(page)
}

// The search box appears once the lazy encyclopedia chunks and its data have loaded.
const encyclopediaReady = (page: Page) => expect(page.getByRole('searchbox')).toBeVisible()

const loadedShell = (page: Page) => page.evaluate(() => [...new Set(performance.getEntriesByType('resource')
  .map(entry => new URL(entry.name)).filter(url => url.origin === location.origin && /^\/assets\/.+\.(js|css)$/.test(url.pathname))
  .map(url => url.pathname))])

const cachedPaths = (page: Page) => page.evaluate(async name =>
  (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname).sort(), CACHE_NAME)

/** Paths still missing from the Worker cache; storing runs after each response, so callers poll until it is empty. */
const uncached = async (page: Page, paths: readonly string[]) => {
  const cached = new Set(await cachedPaths(page))
  return paths.filter(path => !cached.has(path))
}
const STORE_TIMEOUT = { timeout: 30_000 }

test('the online encyclopedia works and the retired download and bookmark return 404 @webkit', async ({ page }) => {
  await controlledEncyclopedia(page)
  await expect(page.locator('.encyclopedia-offline')).toHaveCount(0)
  await page.getByRole('searchbox').fill('a004')
  await expect(galleryEntries(page)).toHaveCount(1)

  const archive = await page.request.get(`${site.origin}/offline-encyclopedia/manifest.json`)
  expect(archive.status()).toBe(404)
  const bookmark = await page.goto(`${site.origin}/offline-encyclopedia/`, documentLoad)
  expect(bookmark?.status()).toBe(404)
})

test('a repeat visit loads the hashed app shell and startup data from the Worker @webkit', async ({ page }) => {
  await controlledEncyclopedia(page)
  // The build carries the language list, so startup goes straight to the pack.
  expect(requests).not.toContain('/i18n/manifest.json')
  // The Worker may already hold these from the first visit, so read what the page loaded from the page itself.
  const shell = await loadedShell(page)
  expect(shell.length).toBeGreaterThan(0)
  expect(startupData()).toHaveLength(4)
  await expect.poll(() => uncached(page, [...shell, ...startupData()]), STORE_TIMEOUT).toEqual([])

  requests.length = 0
  await page.reload(documentLoad)
  await encyclopediaReady(page)
  // The document still comes from the origin; hashed files and the language list do not.
  expect(requests).toContain('/')
  expect(requests).not.toContain('/i18n/manifest.json')
  expect(requests.filter(path => path.startsWith('/assets/') && /\.(js|css)$/.test(path))).toEqual([])
  expect(requests.filter(path => STARTUP_DATA.test(path))).toEqual([])
})

test('bytes that do not match the build are served but never cached @webkit', async ({ page }) => {
  const stylesheet = readFileSync(join(siteDirectory, 'index.html'), 'utf8').match(/href="(\/assets\/[^"]+\.css)"/)?.[1]
  if (!stylesheet) throw new Error('The entry document has no hashed stylesheet')
  tampered.add(stylesheet)
  await controlledEncyclopedia(page)
  await expect.poll(() => uncached(page, startupData()), STORE_TIMEOUT).toEqual([])
  expect(await cachedPaths(page)).not.toContain(stylesheet)

  requests.length = 0
  await page.reload(documentLoad)
  await encyclopediaReady(page)
  expect(requests).toContain(stylesheet)
})

test('startup renders without card text, while the encyclopedia waits for it @webkit', async ({ page }) => {
  const manifest = JSON.parse(readFileSync(join(siteDirectory, 'i18n/manifest.json'), 'utf8'))
  const zh = manifest.languages.find((language: { id: string }) => language.id === 'zh')
  const cardText = JSON.parse(readFileSync(join(siteDirectory, 'i18n', zh.cards.file), 'utf8')).messages
  const baseboards: string = cardText['cardFaces.A004_Baseboards.name']
  expect(Object.keys(JSON.parse(readFileSync(join(siteDirectory, 'i18n', zh.core.file), 'utf8')).messages)
    .filter(key => key.startsWith('cardFaces.'))).toEqual([])
  cardTextHeld = new Promise(resolve => { releaseCardText = resolve })

  await page.addInitScript(() => { localStorage.setItem('open-agricola-locale-v2', 'zh') })
  await page.goto(`${site.origin}/?bg=none`, documentLoad)
  await expect(page.locator('#initial-load')).toHaveCount(0)
  await expect.poll(() => requests).toContain(`/i18n/${zh.cards.file}`)

  requests.length = 0
  await page.goto(`${site.origin}/?page=encyclopedia&bg=none`, documentLoad)
  // Card metadata and the encyclopedia's own data download meanwhile, yet the page does not mount while card text is held.
  await expect.poll(() => page.evaluate(() =>
    performance.getEntriesByType('resource').some(entry => entry.name.includes('/cards-manifest.')))).toBe(true)
  await expect.poll(() => requests.some(path => /^\/card-encyclopedia\/search\.[a-f0-9]{16}\.json$/.test(path))).toBe(true)
  await page.waitForTimeout(1_500)
  await expect(page.getByText('加载卡牌数据…')).toBeVisible()
  await expect(page.getByRole('searchbox')).toHaveCount(0)

  releaseCardText?.()
  const search = page.getByRole('searchbox')
  await search.fill('a004')
  await expect(page.getByRole('button', { name: new RegExp(baseboards) }).first()).toBeVisible()
})

function chinesePacks() {
  const manifest = JSON.parse(readFileSync(join(siteDirectory, 'i18n/manifest.json'), 'utf8'))
  const zh = manifest.languages.find((language: { id: string }) => language.id === 'zh')
  return { core: `/i18n/${zh.core.file}`, cards: `/i18n/${zh.cards.file}` }
}
const gameChunk = (paths: readonly string[]) => paths.some(path => /^\/assets\/GameContainerApi-[\w-]+\.js$/.test(path))
const cardsManifest = (paths: readonly string[]) => paths.some(path => /^\/cards-manifest\.[a-f0-9]{64}\.json$/.test(path))

test('a room link starts card data and the game screen at startup, beside the core pack @webkit', async ({ page }) => {
  const packs = chinesePacks()
  coreHeld = new Promise(resolve => { releaseCore = resolve })
  await page.addInitScript(() => { localStorage.setItem('open-agricola-locale-v2', 'zh') })
  await page.goto(`${site.origin}/?context=00000000-0000-4000-8000-000000000000&bg=none`, documentLoad)
  // The board needs all of these, so they download while the core pack is still on its way.
  await expect.poll(() => [requests.includes(packs.core), requests.includes(packs.cards), cardsManifest(requests), gameChunk(requests)])
    .toEqual([true, true, true, true])
  await expect(page.locator('#initial-load')).toHaveCount(1)
  releaseCore?.()
  await expect(page.locator('#initial-load')).toHaveCount(0)
})

test('the lobby downloads card text only after its first screen is up @webkit', async ({ page }) => {
  const packs = chinesePacks()
  coreHeld = new Promise(resolve => { releaseCore = resolve })
  await page.addInitScript(() => { localStorage.setItem('open-agricola-locale-v2', 'zh') })
  await page.goto(`${site.origin}/?bg=none`, documentLoad)
  await expect.poll(() => requests).toContain(packs.core)
  await page.waitForTimeout(1_000)
  expect(requests).not.toContain(packs.cards)
  await expect(page.locator('#initial-load')).toHaveCount(1)

  releaseCore?.()
  await expect(page.locator('#initial-load')).toHaveCount(0)
  await expect.poll(() => requests).toContain(packs.cards)
  // The Worker may fetch the game screen in the background; the lobby itself never loads it.
  expect(gameChunk(await page.evaluate(() => performance.getEntriesByType('resource').map(entry => new URL(entry.name).pathname)))).toBe(false)
})

test('the first visit leaves the next one served by the Worker, game screen included @webkit', async ({ page, context }) => {
  await page.addInitScript(() => { localStorage.setItem('open-agricola-locale-v2', 'zh') })
  // This visit is not controlled: the Worker installs while it runs.
  await page.goto(`${site.origin}/?page=encyclopedia&bg=none`, documentLoad)
  await encyclopediaReady(page)
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull()
  const shell = [...new Set(requests.filter(path => path.startsWith('/assets/') && /\.(js|css)$/.test(path)))]
  const sw = readFileSync(join(siteDirectory, 'sw.js'), 'utf8')
  const game = sw.match(/assets\/GameContainerApi-[\w-]+\.js/)?.[0]
  if (!game) throw new Error('The Worker lists no game screen chunk to warm')
  await expect.poll(() => uncached(page, [...shell, ...startupData(), `/${game}`]), STORE_TIMEOUT).toEqual([])

  requests.length = 0
  const next = await context.newPage()
  await next.goto(`${site.origin}/?page=encyclopedia&bg=none`, documentLoad)
  await encyclopediaReady(next)
  expect(await next.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(`${site.origin}/sw.js`)
  expect(requests.filter(path => path.startsWith('/assets/') && /\.(js|css)$/.test(path))).toEqual([])
  expect(requests.filter(path => STARTUP_DATA.test(path))).toEqual([])
})

