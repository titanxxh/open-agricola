// @covers client/main.tsx
// @covers client/public-assets/
// @covers scripts/vite-service-worker.ts
import { expect, test, type BrowserContext, type BrowserType, type Page, type Request, type WebSocket } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { createHash, createPublicKey } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { connect, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'
import type { Duplex } from 'node:stream'
import { publicAssetBaseUrl } from '../scripts/public-assets'
import { buildServiceWorker } from '../scripts/vite-service-worker'
import { BACKEND_URL, FRONTEND_URL, browserRequestHeaders } from './fixtures'
import { buildPagesFrontend, servePagesFrontend } from './helpers/pages-frontend'
import { authenticateSolo, SoloBrowserDriver } from './helpers/standard-solo-acceptance'

const IMAGE = 'assets/revised/meeples.png'
const FONT = 'assets/revised/fonts/Dominican.woff2'
const SEASON = 'assets/website-bg/spring-1.webp'
const REPLAY_ART = 'assets/revised/card_frames.jpg'
const PUBLISH_URL = new URL(publicAssetBaseUrl())
const CACHE_NAME = 'open-agricola-public-assets-v1'
const IMAGE_DIMENSIONS = [2048, 2048]
const MISMATCH_DIMENSIONS = [628, 769]
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
}

async function listen(server: Server) {
  await new Promise<void>((done, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', done)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Asset fixture requires a loopback port')
  return address.port
}

async function startAssetOrigin(checkout: string, directory: string) {
  const keyPath = join(directory, 'key.pem')
  const certPath = join(directory, 'cert.pem')
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes',
    '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', `/CN=${PUBLISH_URL.hostname}`,
    '-addext', `subjectAltName=DNS:${PUBLISH_URL.hostname}`,
  ], { stdio: 'ignore' })
  const requests: string[] = []
  const sockets = new Set<Duplex>()
  const overrides = new Map<string, string>()
  const inventory = new Set(execFileSync('git', ['ls-files', 'assets/'], { cwd: checkout, encoding: 'utf8' }).trim().split('\n'))
  const track = (socket: Duplex) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => socket.destroy())
  }
  const key = readFileSync(keyPath)
  const spki = createHash('sha256').update(createPublicKey(key).export({ type: 'spki', format: 'der' })).digest('base64')
  const assetSite = createHttpsServer({ key, cert: readFileSync(certPath) }, (request, response) => {
    const url = new URL(request.url ?? '/', PUBLISH_URL)
    const file = url.pathname.slice(PUBLISH_URL.pathname.length)
    if (request.method === 'GET') requests.push(file)
    if (!url.pathname.startsWith(PUBLISH_URL.pathname) || !inventory.has(file)) {
      response.writeHead(404).end()
      return
    }
    const bytes = readFileSync(join(checkout, overrides.get(file) ?? file))
    const etag = `"${createHash('sha256').update(bytes).digest('hex')}"`
    const headers = {
      'access-control-allow-origin': '*',
      'timing-allow-origin': '*',
      'cache-control': 'max-age=0',
      'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
      etag,
    }
    if (request.headers['if-none-match'] === etag) {
      response.writeHead(304, headers).end()
      return
    }
    response.writeHead(200, { ...headers, 'content-length': bytes.length })
    response.end(request.method === 'HEAD' ? undefined : bytes)
  })
  const assetPort = await listen(assetSite)
  // Preserve the artifact's canonical HTTPS asset URL, with real HTTP caching and no Playwright routing.
  const proxy = createHttpServer((_request, response) => { response.writeHead(502).end() })
  proxy.on('connect', (request, client, head) => {
    if (request.url !== `${PUBLISH_URL.hostname}:443`) {
      client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
      return
    }
    track(client)
    const upstream = connect(assetPort, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length) upstream.write(head)
      client.pipe(upstream).pipe(client)
    })
    track(upstream)
  })
  const port = await listen(proxy)
  return {
    proxy: { server: `http://127.0.0.1:${port}`, bypass: '127.0.0.1,localhost' },
    spki,
    requests,
    overrides,
    async close() {
      for (const socket of sockets) socket.destroy()
      await Promise.all([proxy, assetSite].map(server => new Promise<void>(done => server.close(() => done()))))
    },
  }
}

async function loadAssets(page: Page, origin: string, expectedImage: readonly number[]) {
  const failures: string[] = []
  const trackFailure = (request: Request) => {
    if (request.url().startsWith(PUBLISH_URL.href)) failures.push(`${request.url()} ${request.failure()?.errorText}`)
  }
  page.on('requestfailed', trackFailure)
  await page.goto(`${origin}/?bg=spring-1`, { waitUntil: 'load' })
  const imageUrl = new URL(IMAGE, PUBLISH_URL).href
  const seasonUrl = new URL(SEASON, PUBLISH_URL).href
  await expect(page.locator('link[rel=preload][as=image]')).toHaveAttribute('href', seasonUrl)
  await expect.poll(() => page.evaluate(() =>
    Array.from(document.fonts).some(font => font.family === 'Dominican'))).toBe(true)
  const result = await page.evaluate(async ({ imageUrl, seasonUrl }) => {
    const font = Array.from(document.fonts).find(face => face.family === 'Dominican')
    if (!font) throw new Error('The Pages stylesheet did not define Dominican')
    const decode = async (url: string) => {
      const image = new Image()
      image.src = url
      try { await image.decode() } catch (error) { throw new Error(`Could not decode ${url}`, { cause: error }) }
      return [image.naturalWidth, image.naturalHeight]
    }
    const [image, season] = await Promise.all([
      decode(imageUrl), decode(seasonUrl), font.load(),
    ])
    return { image, seasonDecoded: season[0] > 0 }
  }, { imageUrl, seasonUrl }).catch(error => {
    throw new Error(`Asset rendering failed. Browser failures: ${failures.join(', ')}. Origin requests: ${assets.requests.join(', ')}`, { cause: error })
  }).finally(() => page.off('requestfailed', trackFailure))
  expect(result).toEqual({ image: expectedImage, seasonDecoded: true })
  await expect.poll(() => page.evaluate(() => {
    const canvas = document.createElement('canvas').getContext('2d')
    if (!canvas) throw new Error('The browser could not measure rendered text')
    const sample = 'Agricola 0123 WWW'
    canvas.font = '36px monospace'
    const fallbackWidth = canvas.measureText(sample).width
    canvas.font = '36px Dominican, monospace'
    return canvas.measureText(sample).width !== fallbackWidth
  }), { message: 'The Pages stylesheet renders Dominican rather than the fallback' }).toBe(true)
}

async function cachedPaths(page: Page) {
  return page.evaluate(async cacheName =>
    (await (await caches.open(cacheName)).keys()).map(key => new URL(key.url).pathname), CACHE_NAME)
}

function paths(files: readonly string[]) {
  return files.map(file => new URL(file, PUBLISH_URL).pathname)
}

test.describe.configure({ timeout: 180_000 })
test.use({ actionTimeout: 10_000 })
test.skip(({ browserName }) => browserName === 'firefox', 'This release verifies Chromium and WebKit')

let directory: string
let site: Awaited<ReturnType<typeof servePagesFrontend>>
let assets: Awaited<ReturnType<typeof startAssetOrigin>>
let workerPath: string
let normalWorker: string
let emergencyWorker: string

test.beforeAll(async () => {
  const assetCheckout = process.env.E2E_PUBLIC_ASSET_DIR || process.env.PUBLIC_ASSET_VALIDATION_DIR
  if (!assetCheckout) throw new Error('Set E2E_PUBLIC_ASSET_DIR or PUBLIC_ASSET_VALIDATION_DIR to a clean, pinned public asset checkout')
  directory = mkdtempSync(join(tmpdir(), 'oa-public-asset-worker-'))
  const siteDirectory = join(directory, 'pages')
  mkdirSync(siteDirectory)
  site = await servePagesFrontend(siteDirectory, { backendUrl: BACKEND_URL, frontendOrigin: FRONTEND_URL })
  const artifact = buildPagesFrontend(site.origin)
  cpSync(artifact.directory, siteDirectory, { recursive: true })
  workerPath = join(siteDirectory, 'sw.js')
  normalWorker = readFileSync(workerPath, 'utf8')
  emergencyWorker = await buildServiceWorker({ baseUrl: PUBLISH_URL },
    readFileSync(join(siteDirectory, 'offline-encyclopedia/index.html'), 'utf8'),
    { assets: false, roomOffline: true, offlineEncyclopedia: true, emergencyTakeover: true })
  assets = await startAssetOrigin(resolve(assetCheckout), directory)
})

test('a completed Replay Viewer still loads retained artwork from its public URL @webkit', async ({ playwright, browserName, request }) => {
  const response = await request.post(`${BACKEND_URL}/api/test/replays/completed`, { headers: browserRequestHeaders() })
  expect(response.status()).toBe(201)
  const { roomId } = await response.json()
  const context = await openProfile(playwright[browserName], 'replay')
  try {
    const page = await pageIn(context)
    const failures: string[] = []
    page.on('console', message => {
      if (message.type() === 'error') failures.push(message.text())
    })
    page.on('requestfailed', request => failures.push(`${request.url()} ${request.failure()?.errorText}`))
    page.on('response', response => {
      if (response.status() >= 400) failures.push(`${response.url()} ${response.status()}`)
    })
    await firstInstall(page)
    assets.requests.length = 0
    await page.goto(`${site.origin}/?room=${roomId}&perspective=open&layout=timeline`)
    expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(`${site.origin}/sw.js`)
    const iframe = page.locator('.replay-shell--viewer iframe')
    await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts')
    await expect(iframe).toHaveAttribute('credentialless', '')
    const replay = iframe.contentFrame()
    await expect(replay.locator('.replay-app')).toBeVisible().catch(error => {
      throw new Error(`Replay Viewer did not start. ${failures.join('\n')}`, { cause: error })
    })
    const majorSupply = replay.locator('.major-improvements')
    await majorSupply.locator('h2').click()
    await expect(majorSupply.locator('[data-card-anchor="Major_Well"]')).toBeVisible()
    await expect(majorSupply.locator('.card-frame').first()).toHaveCSS(
      'background-image', `url("${new URL(REPLAY_ART, PUBLISH_URL).href}")`,
    )
    await expect.poll(() => assets.requests.includes(REPLAY_ART)).toBe(true)
    expect(await cachedPaths(page)).not.toContain(paths([REPLAY_ART])[0])
    await replay.locator('.replay-transport button').nth(2).click()
    await expect(replay.locator('.replay-transport output')).toContainText('1 / 2')
  } finally {
    await context.close()
  }
})

test.afterAll(async () => {
  await Promise.all([site?.close(), assets?.close()])
  if (directory) rmSync(directory, { recursive: true, force: true })
})

function openProfile(browser: BrowserType, name: string, serviceWorkers: 'allow' | 'block' = 'allow') {
  return browser.launchPersistentContext(join(directory, name), {
    args: browser.name() === 'chromium' ? [`--ignore-certificate-errors-spki-list=${assets.spki}`] : [],
    ignoreHTTPSErrors: true, proxy: assets.proxy, serviceWorkers,
  })
}

function pageIn(context: BrowserContext) {
  return context.pages()[0] ?? context.newPage()
}

async function firstInstall(page: Page) {
  await page.goto(`${site.origin}/?bg=none`, { waitUntil: 'load' })
  await expect.poll(() => page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistration())?.active?.state)).toBe('activated')
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null)).toBe(null)
}

test('serves verified cross-origin artwork and fonts after browser restart and HTTP cache expiry @webkit', async ({ playwright, browserName }) => {
  const browser = playwright[browserName]
  const probes = [IMAGE, FONT, SEASON]
  let context: BrowserContext | undefined
  try {
    context = await openProfile(browser, 'verified')
    let page = await pageIn(context)
    await firstInstall(page)
    assets.overrides.set(IMAGE, 'assets/revised/action_frame.png')
    assets.requests.length = 0
    await loadAssets(page, site.origin, MISMATCH_DIMENSIONS)
    expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(`${site.origin}/sw.js`)
    await expect.poll(() => cachedPaths(page)).toEqual(expect.arrayContaining(paths([FONT, SEASON])))
    expect(await cachedPaths(page)).not.toContain(paths([IMAGE])[0])
    expect(assets.requests.filter(path => probes.includes(path))).toEqual(expect.arrayContaining(probes))
    await context.close()

    assets.overrides.delete(IMAGE)
    context = await openProfile(browser, 'verified')
    page = await pageIn(context)
    assets.requests.length = 0
    await loadAssets(page, site.origin, IMAGE_DIMENSIONS)
    await expect.poll(() => cachedPaths(page)).toEqual(expect.arrayContaining(paths(probes)))
    expect(assets.requests.filter(path => probes.includes(path))).toEqual([IMAGE])
    await context.close()

    context = await openProfile(browser, 'verified')
    page = await pageIn(context)
    assets.requests.length = 0
    await loadAssets(page, site.origin, IMAGE_DIMENSIONS)
    expect(assets.requests.filter(path => probes.includes(path))).toEqual([])
    await context.close()

    context = await openProfile(browser, 'http-only', 'block')
    await loadAssets(await pageIn(context), site.origin, IMAGE_DIMENSIONS)
    await context.close()
    context = await openProfile(browser, 'http-only', 'block')
    page = await pageIn(context)
    assets.requests.length = 0
    await loadAssets(page, site.origin, IMAGE_DIMENSIONS)
    expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null)).toBe(null)
    expect(assets.requests.filter(path => probes.includes(path))).toEqual(expect.arrayContaining(probes))
  } finally {
    await context?.close()
    assets.overrides.clear()
  }
})

async function updateWorker(page: Page) {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) throw new Error('Main page has no Service Worker registration')
    await registration.update()
  })
}

function observeGame(page: Page) {
  const sockets: WebSocket[] = []
  page.on('websocket', socket => {
    if (/^\/nodes\/[^/]+\/ws$/.test(new URL(socket.url()).pathname)) sockets.push(socket)
  })
  return { driver: new SoloBrowserDriver(page), sockets }
}

test('normal and emergency updates keep an open game playable on its original connection @webkit', async ({ playwright, browserName, request }) => {
  const open = () => openProfile(playwright[browserName], 'updates')
  let context = await open()
  try {
    let page = await pageIn(context)
    await firstInstall(page)
    await loadAssets(page, site.origin, IMAGE_DIMENSIONS)
    const probes = [IMAGE, FONT, SEASON]
    await expect.poll(() => cachedPaths(page)).toEqual(expect.arrayContaining(paths(probes)))
    await authenticateSolo(context, request, `asset_worker_${Date.now().toString(36)}`, site.origin)
    await page.reload()
    const { driver, sockets } = observeGame(page)
    await page.getByRole('button', { name: 'Solo game', exact: true }).click()
    await page.getByRole('dialog', { name: 'Start a solo game' })
      .getByRole('button', { name: 'Start solo game', exact: true }).click()
    await expect(page.locator('.game-layout')).toBeVisible()
    if (driver.state.roundPhase === 'preparation') await driver.choice('__skip__')
    expect(driver.state.roundPhase).toBe('work')
    const roomUrl = page.url()
    const oldPageStart = await page.evaluate(() => performance.timeOrigin)
    const oldSocket = sockets.at(-1)
    expect(oldSocket?.isClosed()).toBe(false)
    const oldSocketCount = sockets.length

    // Identify the new script without changing the shared cache or how it serves any assets.
    writeFileSync(workerPath, `${normalWorker}\nself.addEventListener('message', event => {
      if (event.data === 'which-candidate') event.ports[0]?.postMessage('next-candidate');
    });\n`)
    await updateWorker(page)
    await expect.poll(() => page.evaluate(async () =>
      (await navigator.serviceWorker.getRegistration())?.waiting?.state)).toBe('installed')
    const secondPage = await context.newPage()
    assets.requests.length = 0
    await loadAssets(secondPage, site.origin, IMAGE_DIMENSIONS)
    expect(assets.requests.filter(path => probes.includes(path))).toEqual([])
    const wood = driver.state.players[0]!.resources.wood
    await driver.action('forest')
    expect(driver.state.players[0]!.resources.wood).toBe(wood + 2)
    await driver.confirm()
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(oldPageStart)
    expect(sockets).toHaveLength(oldSocketCount)
    expect(oldSocket?.isClosed()).toBe(false)
    await secondPage.close()

    const cookies = await context.cookies(site.origin)
    await context.close()
    context = await open()
    await context.addCookies(cookies)
    page = await pageIn(context)
    assets.requests.length = 0
    await loadAssets(page, site.origin, IMAGE_DIMENSIONS)
    await expect.poll(() => page.evaluate(() => new Promise<unknown>(done => {
      const channel = new MessageChannel()
      const timeout = setTimeout(() => { channel.port1.close(); done(null) }, 250)
      channel.port1.onmessage = event => {
        clearTimeout(timeout)
        channel.port1.close()
        done(event.data)
      }
      navigator.serviceWorker.controller?.postMessage('which-candidate', [channel.port2])
    }))).toBe('next-candidate')
    expect(assets.requests.filter(path => probes.includes(path))).toEqual([])

    await page.evaluate(() => new Promise<void>(done => {
      const frame = document.createElement('iframe')
      frame.name = 'asset-embed'
      frame.src = '/?bg=none'
      frame.addEventListener('load', () => done(), { once: true })
      document.body.append(frame)
    }))
    const embedded = page.frame({ name: 'asset-embed' })
    if (!embedded) throw new Error('Embedded document did not load')
    assets.requests.length = 0
    expect(await embedded.evaluate(async url => {
      const image = new Image()
      image.src = url
      await image.decode()
      return [image.naturalWidth, image.naturalHeight]
    }, new URL(IMAGE, PUBLISH_URL).href)).toEqual(IMAGE_DIMENSIONS)
    expect(assets.requests.filter(path => path === IMAGE)).toEqual([IMAGE])
    await page.locator('iframe[name="asset-embed"]').evaluate(frame => frame.remove())

    const encyclopedia = await context.newPage()
    await encyclopedia.goto(`${site.origin}/?page=encyclopedia`)
    await encyclopedia.evaluate(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
    await encyclopedia.reload()
    await encyclopedia.getByRole('button', { name: 'Save for offline reading' }).click()
    await expect(encyclopedia.getByText(/^English · Version [a-f0-9]{12} · Saved/)).toBeVisible()
    await encyclopedia.close()

    const resumedGame = observeGame(page)
    await page.goto(roomUrl)
    await expect(page.locator('.game-layout')).toBeVisible()
    const currentPageStart = await page.evaluate(() => performance.timeOrigin)
    const resumedSocket = resumedGame.sockets.at(-1)
    expect(resumedSocket?.isClosed()).toBe(false)
    const resumedSocketCount = resumedGame.sockets.length
    await page.evaluate(() => {
      navigator.serviceWorker.addEventListener('controllerchange',
        () => { Reflect.set(window, 'publicAssetTestControllerChanged', true) }, { once: true })
    })
    writeFileSync(workerPath, emergencyWorker)
    await updateWorker(page)
    await expect.poll(() => page.evaluate(() => Reflect.get(window, 'publicAssetTestControllerChanged'))).toBe(true)
    const food = resumedGame.driver.state.players[0]!.resources.food
    await resumedGame.driver.action('day-laborer')
    expect(resumedGame.driver.state.players[0]!.resources.food).toBe(food + 2)
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(currentPageStart)
    expect(resumedGame.sockets).toHaveLength(resumedSocketCount)
    expect(resumedSocket?.isClosed()).toBe(false)
    assets.requests.length = 0
    await loadAssets(await context.newPage(), site.origin, IMAGE_DIMENSIONS)
    expect(assets.requests.filter(path => path === IMAGE)).toEqual([IMAGE])
    const bookmark = await context.newPage()
    await bookmark.goto(`${site.origin}/offline-encyclopedia/`)
    await expect(bookmark.getByRole('searchbox', { name: 'Search cards by number, name, or text' })).toBeVisible()
  } finally {
    writeFileSync(workerPath, normalWorker)
    await context.close()
  }
})
