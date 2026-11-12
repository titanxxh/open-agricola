// @covers client/workshop-game/
// @covers client/app/WorkshopPage.tsx
// @covers client/app/application-bootstrap.ts
import { expect, test, type Page } from '@playwright/test'

const query = '?page=game&player=p1&embedded=1&devMode=1'
const entry = `/workshop-game.html${query}`

function observeStartup(page: Page) {
  const requests: string[] = []
  page.on('request', request => {
    const path = new URL(request.url()).pathname
    if (path.startsWith('/api/') || path === '/cards-manifest.json' || path === '/i18n/manifest.json'
      || path === '/client/workshop-game/initialize.tsx') requests.push(path)
  })
  const sockets: string[] = []
  page.on('websocket', socket => {
    if (new URL(socket.url()).pathname === '/ws') sockets.push(socket.url())
  })
  return { requests, sockets }
}

const documentWithFrame = (src: string) => `<!doctype html><html><body><iframe src="${src.replaceAll('&', '&amp;')}"></iframe></body></html>`

test('the dedicated game entry is inert when opened as a top-level page', async ({ page }) => {
  const observed = observeStartup(page)
  await page.goto(entry)
  await expect(page.getByRole('link', { name: 'Open Agricola', exact: true })).toBeVisible()
  await expect(page.getByRole('link')).toHaveAttribute('target', '_blank')
  expect(observed).toEqual({ requests: [], sockets: [] })
})

test('a sibling prerelease parent cannot initialize either formal application entry', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('The frontend URL is required')
  const formal = 'https://formal.titanxxh.test'
  const pre = 'https://pre.titanxxh.test'
  await page.route('https://*.titanxxh.test/**', async route => {
    const url = new URL(route.request().url())
    if (url.origin === pre) {
      await route.fulfill({ contentType: 'text/html', body: documentWithFrame(`${formal}${entry}`) })
      return
    }
    const response = await route.fetch({ url: new URL(`${url.pathname}${url.search}`, baseURL).href })
    await route.fulfill({ response })
  })
  const observed = observeStartup(page)
  await page.goto(`${pre}/?page=workshop`)
  const child = page.frameLocator('iframe')
  await expect(child.getByRole('link', { name: 'Open Agricola', exact: true })).toBeVisible()
  expect(observed).toEqual({ requests: [], sockets: [] })
  await page.locator('iframe').evaluate((iframe, src) => { iframe.setAttribute('src', src) }, `${formal}/${query}`)
  await expect.poll(() => page.frames().find(frame => frame.parentFrame())?.url()).toBe(`${formal}/${query}`)
  await expect(child.getByRole('link', { name: 'Open Agricola', exact: true })).toBeVisible()
  expect(observed).toEqual({ requests: [], sockets: [] })
})

test('a nested same-origin Workshop parent cannot initialize a game', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('The frontend URL is required')
  await page.route(`${baseURL}/?outer=1`, route => route.fulfill({
    contentType: 'text/html', body: documentWithFrame('/?page=workshop'),
  }))
  await page.route(`${baseURL}/?page=workshop`, route => route.fulfill({
    contentType: 'text/html', body: documentWithFrame(entry),
  }))
  const observed = observeStartup(page)
  await page.goto('/?outer=1')
  await expect(page.frameLocator('iframe').frameLocator('iframe').getByRole('link', { name: 'Open Agricola', exact: true })).toBeVisible()
  expect(observed).toEqual({ requests: [], sockets: [] })
})

for (const suffix of ['&room=private-room', '&transport=ws', '&page=login', '&context=private-context']) {
  test(`the Workshop entry rejects unexpected modes ${suffix}`, async ({ page, baseURL }) => {
    if (!baseURL) throw new Error('The frontend URL is required')
    await page.route(`${baseURL}/?page=workshop`, route => route.fulfill({
      contentType: 'text/html', body: documentWithFrame(`${entry}${suffix}`),
    }))
    const observed = observeStartup(page)
    await page.goto('/?page=workshop')
    await expect(page.frameLocator('iframe').getByRole('link', { name: 'Open Agricola', exact: true })).toBeVisible()
    expect(observed).toEqual({ requests: [], sockets: [] })
  })
}

test('the real top-level Workshop starts its game through the bounded entry', async ({ page }) => {
  const gameRequests: string[] = []
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/game/') && request.frame().parentFrame()) gameRequests.push(request.url())
  })
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  await page.goto('/?page=workshop&player=p1&devMode=1')
  await expect(page.getByTestId('workshop-root')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Enter Sandbox' }).click()
  await page.locator('.ws-sandbox-btns').getByRole('button', { name: 'Start Sandbox' }).click()
  const iframe = page.locator('iframe[title="Sandbox"]')
  await expect(iframe).toHaveAttribute('src', /^\/workshop-game\.html\?page=game&player=p1&embedded=1&devMode=1/)
  const game = page.frameLocator('iframe[title="Sandbox"]')
  await expect(game.locator('.action-board')).toBeVisible({ timeout: 30_000 })
  await expect(game.locator('.farm-grid').first()).toBeVisible()
  if (process.env.VITE_SANDBOX_EXECUTOR === 'browser') expect(gameRequests).toEqual([])
  else expect(gameRequests.length).toBeGreaterThan(0)
})
