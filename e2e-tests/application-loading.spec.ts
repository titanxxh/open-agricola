// @covers client/main.tsx client/App.tsx client/app/PageRouter.tsx client/app/CardMetadataBoundary.tsx client/services/card-meta.ts client/services/language-pack.ts client/components/common/BrandMark.tsx
import { expect, test } from '@playwright/test'
import { buildPagesFrontend, PAGES_API_ORIGIN, servePagesFrontend } from './helpers/pages-frontend'

let site: Awaited<ReturnType<typeof servePagesFrontend>>

test.beforeAll(async () => {
  test.setTimeout(900_000)
  site = await servePagesFrontend(buildPagesFrontend().directory)
})
test.afterAll(async () => { await site?.close() })

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  await context.route(`${PAGES_API_ORIGIN}/api/**`, route => route.fulfill({ json: { ok: true, user: null, rooms: [], games: [] } }))
  await context.route('https://titanxxh.github.io/**', route => route.abort())
  await context.route('https://storage.ko-fi.com/**', route => route.abort())
})

test('anonymous login remains usable when card metadata is unavailable', async ({ page }) => {
  await page.route('**/cards-manifest*.json', route => route.fulfill({ status: 503, body: 'Unavailable' }))
  await page.goto(site.origin, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toBeVisible({ timeout: 5000 })
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeEnabled()
  const logo = page.getByRole('img', { name: 'Open Agricola logo' })
  await expect.poll(() => logo.evaluate(image => image instanceof HTMLImageElement && image.naturalWidth)).toBe(128)
  await expect(logo).toHaveAttribute('src', /\/assets\/brand-logo-[\w-]+\.png$/)
})

test('application code downloads while the selected language pack is pending', async ({ page }) => {
  let release = () => {}
  const held = new Promise<void>(resolve => { release = resolve })
  const appRequests: string[] = []
  page.on('request', request => {
    if (/\/assets\/App-[\w-]+\.js$/.test(new URL(request.url()).pathname)) appRequests.push(request.url())
  })
  await page.route('**/i18n/en.*.json', async route => { await held; await route.continue() })
  try {
    await page.goto(site.origin, { waitUntil: 'domcontentloaded' })
    await expect.poll(() => appRequests.length, { timeout: 5000 }).toBeGreaterThan(0)
    await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toHaveCount(0)
  } finally { release() }
  await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toBeVisible()
})

test('the public encyclopedia waits for metadata before showing card faces', async ({ page }) => {
  let release = () => {}
  let requested = ''
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route('**/cards-manifest*.json', async route => {
    requested = new URL(route.request().url()).pathname
    await held
    await route.continue()
  })
  try {
    await page.goto(`${site.origin}/?page=encyclopedia&entry=card:A004_Baseboards`, { waitUntil: 'domcontentloaded' })
    await expect.poll(() => requested).toMatch(/^\/cards-manifest\.[a-f0-9]{64}\.json$/)
    await expect(page.getByRole('dialog', { name: 'Baseboards', exact: true })).toHaveCount(0)
    await expect(page.getByRole('progressbar')).toBeVisible()
  } finally { release() }
  await expect(page.getByRole('dialog', { name: 'Baseboards', exact: true })).toBeVisible()
})

test('signing in starts card loading without exposing the authenticated page before readiness', async ({ page }) => {
  let signedIn = false
  let requested = false
  let release = () => {}
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route(`${PAGES_API_ORIGIN}/api/auth/login`, route => {
    signedIn = true
    return route.fulfill({ json: { ok: true } })
  })
  await page.route(`${PAGES_API_ORIGIN}/api/auth/me`, route => route.fulfill({ json: {
    ok: true,
    user: signedIn ? { id: 'reader', username: 'reader', displayName: 'Reader' } : null,
  } }))
  await page.route('**/cards-manifest*.json', async route => {
    requested = true
    await held
    await route.continue()
  })
  try {
    await page.goto(site.origin, { waitUntil: 'domcontentloaded' })
    await page.getByRole('textbox', { name: 'Username', exact: true }).fill('reader')
    await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery')
    expect(requested).toBe(false)
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect.poll(() => requested).toBe(true)
    await expect(page.getByRole('button', { name: 'Create Multiplayer Game' })).toHaveCount(0)
    await expect(page.getByRole('progressbar')).toBeVisible()
  } finally { release() }
  await expect(page.getByRole('button', { name: 'Create Multiplayer Game' })).toBeVisible()
})
