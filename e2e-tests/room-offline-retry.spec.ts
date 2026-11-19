// @covers client/service-worker/room-offline.worker.ts client/utils/game-room-url.ts
import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BACKEND_URL, FRONTEND_URL, browserRequestHeaders } from './fixtures'
import { buildPagesFrontend, servePagesFrontend } from './helpers/pages-frontend'
import { authenticateSolo, SoloBrowserDriver } from './helpers/standard-solo-acceptance'

const english = 'Unable to open the room right now. Check your connection and try again.'
const chinese = '暂时无法打开房间，请检查网络后重试'
const retryHeading = (page: Page) => page.getByRole('heading', { name: /^(Unable to open the room|暂时无法打开房间)/ })
const cacheName = 'open-agricola-room-offline-v1'
const documentLoad = { waitUntil: 'domcontentloaded' } as const

let directory: string
let site: Awaited<ReturnType<typeof servePagesFrontend>>
let indexHtml: string
let stopApi = false
const documents = new Map<string, 'disconnect' | 'cacheable' | 404 | 503>()
const documentRequests: string[] = []
const gameContextRequests: string[] = []

test.describe.configure({ timeout: 180_000 })
test.skip(({ browserName }) => browserName === 'firefox', 'This release verifies Chromium and WebKit')

test.beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'oa-room-offline-retry-'))
  const siteDirectory = join(directory, 'pages')
  mkdirSync(siteDirectory)
  site = await servePagesFrontend(siteDirectory, { backendUrl: BACKEND_URL, frontendOrigin: FRONTEND_URL }, (request, response) => {
    const url = new URL(request.url ?? '/', 'http://pages.invalid')
    if (url.pathname.startsWith('/api/v1/game-contexts/')) gameContextRequests.push(url.pathname + url.search)
    if (stopApi && url.pathname.startsWith('/api/')) {
      response.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      response.end(JSON.stringify({ ok: false, code: 'server_unavailable' }))
      return true
    }
    if (url.pathname !== '/') return false
    documentRequests.push(url.search)
    const behavior = documents.get(url.search)
    if (behavior === 'disconnect') {
      request.socket.destroy()
      return true
    }
    if (behavior === 404 || behavior === 503) {
      response.writeHead(behavior, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' })
      response.end(`<!doctype html><h1>Origin HTTP ${behavior}</h1>`)
      return true
    }
    response.writeHead(200, {
      'Content-Type': 'text/html',
      'Cache-Control': behavior === 'cacheable' ? 'public, max-age=600' : 'no-store',
    })
    response.end(indexHtml)
    return true
  })
  const artifact = buildPagesFrontend(site.origin)
  cpSync(artifact.directory, siteDirectory, { recursive: true })
  indexHtml = readFileSync(join(siteDirectory, 'index.html'), 'utf8')
})

test.afterEach(() => {
  documents.clear()
  documentRequests.length = 0
  gameContextRequests.length = 0
  stopApi = false
})

test.afterAll(async () => {
  await site?.close()
  if (directory) rmSync(directory, { recursive: true, force: true })
})

async function controlledLobby(page: Page, language: 'en' | 'zh' = 'en') {
  await page.addInitScript(locale => {
    if (!localStorage.getItem('open-agricola-locale-v2')) localStorage.setItem('open-agricola-locale-v2', locale)
  }, language)
  await page.goto(`${site.origin}/?bg=none`, documentLoad)
  await expect.poll(() => page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistration())?.active?.state)).toBe('activated')
  await page.reload(documentLoad)
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(`${site.origin}/sw.js`)
}

async function restoreAndRetry(page: Page, target: URL, label: string) {
  documents.delete(target.search)
  const previousDocument = await page.evaluate(() => performance.timeOrigin)
  const requestsBefore = documentRequests.length
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(retryHeading(page)).toBeVisible()
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(previousDocument)
  expect(documentRequests).toHaveLength(requestsBefore)

  const navigation = page.waitForEvent('request', {
    predicate: request => {
      const url = new URL(request.url())
      return request.isNavigationRequest() && url.origin === target.origin && url.pathname === target.pathname && url.search === target.search
    },
  })
  await page.getByRole('button', { name: label, exact: true }).click()
  await navigation
  await expect(retryHeading(page)).toHaveCount(0)
  expect(new URL(page.url()).hash).toBe(target.hash)
}

test('a failed room navigation preserves an anchored Replay URL for manual retry @webkit', async ({ page, request }) => {
  const fixture = await request.post(`${BACKEND_URL}/api/test/replays/completed`, { headers: browserRequestHeaders() })
  expect(fixture.status()).toBe(201)
  const replay: unknown = await fixture.json()
  if (!replay || typeof replay !== 'object' || !('roomId' in replay) || typeof replay.roomId !== 'string'
    || !('firstStepHash' in replay) || typeof replay.firstStepHash !== 'string') throw new Error('Replay fixture has no first anchor')
  await controlledLobby(page)

  const target = new URL(`/?room=${replay.roomId}&perspective=open&layout=timeline&step=0&frame=${replay.firstStepHash}#bookmark`, site.origin)
  documents.set(target.search, 'disconnect')
  await page.goto(target.href, documentLoad)
  await expect(page.getByRole('heading', { name: english, exact: true })).toBeVisible()
  await expect(page).toHaveURL(target.href)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  expect(documentRequests).toContain(target.search)

  await restoreAndRetry(page, target, 'Retry')
  await expect(page.frameLocator('.replay-shell--viewer iframe').locator('.replay-app')).toBeVisible()
})

test('a failed participant link uses the saved Chinese locale and retries with participant intent @webkit', async ({ page }) => {
  await controlledLobby(page, 'zh')
  const id = randomUUID()
  const target = new URL(`/?context=${id}&page=game#private-link`, site.origin)
  documents.set(target.search, 'disconnect')
  await page.goto(target.href, documentLoad)
  await expect(page.getByRole('heading', { name: chinese, exact: true })).toBeVisible()
  await expect(page).toHaveURL(target.href)
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh')

  await restoreAndRetry(page, target, '重试')
  await expect(page.getByRole('heading', { name: '找不到这局' })).toBeVisible()
  expect(gameContextRequests).toContain(`/api/v1/game-contexts/${id}?intent=resume`)
})

test('origin HTTP errors and an API outage keep their normal results @webkit', async ({ page }) => {
  await controlledLobby(page)
  for (const status of [404, 503] as const) {
    const target = new URL(`/?room=${randomUUID()}`, site.origin)
    documents.set(target.search, status)
    const response = await page.goto(target.href, documentLoad)
    expect(response?.status()).toBe(status)
    await expect(page.getByRole('heading', { name: `Origin HTTP ${status}` })).toBeVisible()
    await expect(retryHeading(page)).toHaveCount(0)
  }
  stopApi = true
  const response = await page.goto(`${site.origin}/?room=${randomUUID()}`, documentLoad)
  expect(response?.status()).toBe(200)
  await expect(page.getByTestId('server-maintenance')).toBeVisible()
  await expect(retryHeading(page)).toHaveCount(0)
})

test('a fresh browser HTTP cache can still serve the original room document @webkit', async ({ page, context }) => {
  await controlledLobby(page)
  const target = new URL(`/?room=${randomUUID()}`, site.origin)
  documents.set(target.search, 'cacheable')
  await page.goto(target.href, documentLoad)
  await expect(page.getByRole('heading', { name: 'Game not found' })).toBeVisible()
  documents.set(target.search, 'disconnect')
  const requestsBefore = documentRequests.length

  const revisit = await context.newPage()
  await revisit.goto(target.href, documentLoad)
  await expect(revisit.getByRole('heading', { name: 'Game not found' })).toBeVisible()
  await expect(retryHeading(revisit)).toHaveCount(0)
  expect(documentRequests).toHaveLength(requestsBefore)
})

test('the browser reports network errors outside the fallback scope or without the saved page @webkit', async ({ browser, page }) => {
  const target = new URL(`/?room=${randomUUID()}`, site.origin)
  const firstVisit = await browser.newPage()
  try {
    documents.set(target.search, 'disconnect')
    await expect(firstVisit.goto(target.href, documentLoad)).rejects.toThrow()
  } finally {
    await firstVisit.close()
  }
  await controlledLobby(page)

  const embedRequest = page.waitForEvent('requestfailed', { predicate: request => request.url() === target.href })
  await page.evaluate(url => {
    const frame = document.createElement('iframe')
    frame.src = url
    document.body.append(frame)
  }, target.href)
  await embedRequest
  const unrelated = new URL('/?page=settings', site.origin)
  documents.set(unrelated.search, 'disconnect')
  await expect(page.goto(unrelated.href, documentLoad)).rejects.toThrow()

  await controlledLobby(page)
  expect(await page.evaluate(cache => caches.delete(cache), cacheName)).toBe(true)
  await expect(page.goto(target.href, documentLoad)).rejects.toThrow()
})

test('an open room reconnects on the same document and can act on the recovered state @webkit', async ({ page, context, request }) => {
  await authenticateSolo(context, request, `room_offline_${Date.now().toString(36)}`, site.origin)
  await controlledLobby(page)
  const sockets: Array<{ page: WebSocketRoute; server: WebSocketRoute }> = []
  await page.routeWebSocket('**/ws', socket => sockets.push({ page: socket, server: socket.connectToServer() }))
  const game = new SoloBrowserDriver(page)
  await page.getByRole('button', { name: 'Solo game', exact: true }).click()
  await page.getByRole('dialog', { name: 'Start a solo game' })
    .getByRole('button', { name: 'Start solo game', exact: true }).click()
  await expect(page.locator('.game-layout')).toBeVisible()
  if (game.state.roundPhase === 'preparation') await game.choice('__skip__')
  await game.action('forest')
  await game.confirm()
  const started = await page.evaluate(() => performance.timeOrigin)
  const previous = game.envelope
  const handoffEventCount = game.events.length
  const connection = sockets.at(-1)
  if (!connection) throw new Error('No room transport to interrupt')
  await connection.page.close({ code: 1012, reason: 'isolated room transport restart' })
  await connection.server.close({ code: 1012, reason: 'isolated room transport restart' })

  await expect.poll(() => game.events.slice(handoffEventCount).some(event =>
    event.type === 'stateUpdate' && event.roomId === previous.roomId && event.version >= previous.version),
  { timeout: 45_000 }).toBe(true)
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(started)
  expect(game.state.players[0]?.resources.wood).toBe(previous.payload.state.players[0]?.resources.wood)
  const food = game.state.players[0]?.resources.food
  if (food === undefined) throw new Error('Reconnected room has no player resources')
  await game.action('day-laborer')
  expect(game.state.players[0]?.resources.food).toBe(food + 2)
})
