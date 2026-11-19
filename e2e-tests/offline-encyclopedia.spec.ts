// @covers client/app/encyclopedia/
// @covers client/service-worker/offline-encyclopedia.worker.ts
// @covers client/services/offline-encyclopedia.ts
// @covers client/services/offline-encyclopedia-storage.ts
// @covers scripts/card-encyclopedia/offline-artifacts.ts
import { expect, test, type BrowserType, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { OFFLINE_ENCYCLOPEDIA_PATH, parseOfflineEncyclopediaManifest } from '../shared/contract/offline-encyclopedia'
import { BACKEND_URL, FRONTEND_URL } from './fixtures'
import { buildPagesFrontend, servePagesFrontend } from './helpers/pages-frontend'
import { ownLaunchOptions } from './helpers/pinned-asset-host'

test.describe.configure({ timeout: 180_000 })
test.skip(({ browserName }) => browserName === 'firefox', 'Offline encyclopedia acceptance uses Chromium and WebKit')

let directory: string
let siteDirectory: string
let site: Awaited<ReturnType<typeof servePagesFrontend>>
const online = () => `${site.origin}/?page=encyclopedia`
const offline = () => `${site.origin}${OFFLINE_ENCYCLOPEDIA_PATH}`
const archiveDirectory = () => join(siteDirectory, 'offline-encyclopedia')
const controls = (page: Page) => page.locator('.encyclopedia-offline')

test.beforeAll(async () => {
  test.setTimeout(900_000)
  directory = mkdtempSync(join(tmpdir(), 'oa-offline-encyclopedia-'))
  siteDirectory = join(directory, 'pages')
  mkdirSync(siteDirectory)
  site = await servePagesFrontend(siteDirectory, { backendUrl: BACKEND_URL, frontendOrigin: FRONTEND_URL })
  cpSync(buildPagesFrontend(site.origin).directory, siteDirectory, { recursive: true })
})

test.afterAll(async () => {
  await site?.close()
  if (directory) rmSync(directory, { recursive: true, force: true })
})

const persistent = (launcher: BrowserType, profile: string, browserName: 'chromium' | 'firefox' | 'webkit') =>
  launcher.launchPersistentContext(profile, { ...ownLaunchOptions(browserName), locale: 'en-US' })

async function openOnline(page: Page) {
  await page.goto(online(), { waitUntil: 'domcontentloaded' })
  await expect(controls(page).getByRole('button', { name: 'Save for offline reading' })).toBeEnabled()
}

async function readCard(page: Page, query: string, heading: string, body: RegExp) {
  await page.getByRole('searchbox').fill(query)
  const entry = page.locator('details').filter({ has: page.locator('summary', { hasText: heading }) }).first()
  await expect(entry).toBeVisible()
  await entry.locator('summary').click()
  await expect(entry).toContainText(body)
}

test('saves one language and opens its independent offline bookmark after restarting the browser @webkit', async ({ playwright, browserName }) => {
  const profile = join(directory, 'restart-profile')
  let context = await persistent(playwright[browserName], profile, browserName)
  try {
    const page = context.pages()[0] ?? await context.newPage()
    await openOnline(page)
    const requests: string[] = []
    page.on('request', request => {
      if (/\/offline-encyclopedia\/.+\.html$/.test(new URL(request.url()).pathname)) requests.push(request.url())
    })
    await controls(page).getByRole('button', { name: 'Save for offline reading' }).click()
    await expect(controls(page)).toContainText(/English · Version [a-f0-9]{12} · Saved/)
    await expect(controls(page).getByRole('link', { name: 'Open offline encyclopedia' })).toHaveAttribute('href', OFFLINE_ENCYCLOPEDIA_PATH)
    expect(requests).toEqual([expect.stringMatching(/\/offline-encyclopedia\/en\.[a-f0-9]{16}\.html$/)])

    await page.getByRole('button', { name: /^Display language/ }).click()
    await page.getByRole('option', { name: '简体中文' }).click()
    await expect(controls(page)).toContainText(/English · 版本/)
    const changeLanguage = controls(page).getByRole('button', { name: '保存为当前语言' })
    await expect(changeLanguage).toBeEnabled()
    expect(requests).toHaveLength(1)
    await changeLanguage.click()
    await expect(controls(page)).toContainText(/简体中文 · 版本 [a-f0-9]{12} · 保存于/)
    expect(requests).toEqual([
      expect.stringMatching(/\/offline-encyclopedia\/en\.[a-f0-9]{16}\.html$/),
      expect.stringMatching(/\/offline-encyclopedia\/zh\.[a-f0-9]{16}\.html$/),
    ])
    await context.close()

    context = await persistent(playwright[browserName], profile, browserName)
    await context.setOffline(true)
    const bookmark = context.pages()[0] ?? await context.newPage()
    const offlineRequests: string[] = []
    bookmark.on('request', request => offlineRequests.push(request.url()))
    const response = await bookmark.goto(offline())
    expect(await response?.headerValue('cache-control')).toBe('no-store')
    await expect(bookmark.getByRole('heading', { name: '离线百科' })).toBeVisible()
    await expect(bookmark.locator('html')).toHaveAttribute('lang', 'zh')
    await readCard(bookmark, 'Ａ００４', '护壁板', /获得.*房间数量/)
    await readCard(bookmark, '护壁板', '护壁板', /木材/)
    expect(offlineRequests).toEqual([offline()])
    expect(await context.cookies()).toEqual([])
  } finally {
    await context.close()
  }
})

test('keeps the saved archive through incomplete, corrupt and quota-limited updates @webkit', async ({ playwright, browserName }) => {
  const manifestPath = join(archiveDirectory(), 'manifest.json')
  const originalText = readFileSync(manifestPath, 'utf8')
  const manifest = parseOfflineEncyclopediaManifest(JSON.parse(originalText))
  const english = manifest.packs.find(pack => pack.locale === 'en')
  if (!english) throw new Error('Pages artifact is missing the English pack')
  const html = readFileSync(join(archiveDirectory(), english.file), 'utf8')
  const updated = html.replace('<main>', '<main><p>Updated public reader</p>')
  const sha256 = createHash('sha256').update(updated).digest('hex')
  const file = `en.${sha256.slice(0, 16)}.html`
  const updatePath = join(archiveDirectory(), file)
  const candidate = { ...english, contentVersion: sha256, file, sha256, size: Buffer.byteLength(updated) }

  const context = await persistent(playwright[browserName], join(directory, 'updates-profile'), browserName)
  try {
    const page = context.pages()[0] ?? await context.newPage()
    await openOnline(page)
    await controls(page).getByRole('button', { name: 'Save for offline reading' }).click()
    await expect(controls(page)).toContainText(english.contentVersion.slice(0, 12))
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, packs: manifest.packs.map(pack => pack === english ? candidate : pack) }))

    async function updateFails() {
      const update = controls(page).getByRole('button', { name: 'Update offline encyclopedia' })
      await expect(update).toBeEnabled()
      await update.click()
      await expect(controls(page).getByRole('alert')).toContainText('Could not save the offline encyclopedia')
      await expect(controls(page)).toContainText(english.contentVersion.slice(0, 12))
      const reader = await context.newPage()
      try {
        await reader.goto(offline())
        await readCard(reader, 'A004', 'Baseboards', /You immediately get/)
        await expect(reader.getByText('Updated public reader')).toHaveCount(0)
      } finally {
        await reader.close()
      }
    }

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(controls(page)).toContainText('A newer offline version is available.')
    await updateFails()
    writeFileSync(updatePath, updated.replace('Updated public reader', 'Corrupt public reader'))
    await updateFails()
    writeFileSync(updatePath, updated)
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put
      IDBObjectStore.prototype.put = function (value, key) {
        if (this.name === 'archive' && key === 'package') throw new DOMException('Fixture quota', 'QuotaExceededError')
        return put.call(this, value, key)
      }
    })
    await updateFails()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await controls(page).getByRole('button', { name: 'Update offline encyclopedia' }).click()
    await expect(controls(page)).toContainText(sha256.slice(0, 12))
    const reader = await context.newPage()
    await reader.goto(offline())
    await expect(reader.getByText('Updated public reader')).toBeVisible()
    await reader.close()

    await page.evaluate(async () => {
      const cache = await caches.open('open-agricola-public-assets-v1')
      await cache.put('/unrelated-artwork', new Response('retained'))
    })
    await controls(page).getByRole('button', { name: 'Delete offline encyclopedia' }).click()
    await expect(controls(page).getByRole('button', { name: 'Save for offline reading' })).toBeEnabled()
    expect(await page.evaluate(async () => (await caches.match('/unrelated-artwork'))?.text())).toBe('retained')
    await context.setOffline(true)
    await page.goto(offline())
    await expect(page.getByText('Download the offline encyclopedia again from the online encyclopedia.')).toBeVisible()
  } finally {
    await context.close()
    writeFileSync(manifestPath, originalText)
    rmSync(updatePath, { force: true })
  }
})
