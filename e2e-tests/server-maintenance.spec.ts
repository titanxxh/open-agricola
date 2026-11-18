// @covers client/services/server-availability.ts client/app/MaintenancePage.tsx client/app/PageRouter.tsx client/contexts/AuthContext.tsx client/app/LoginPage.tsx client/app/GameContainerApi.tsx
import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'

// While the formal backend is down, Caddy answers every API request with this 503 (deploy/Caddyfile.example, #1816).
const UNAVAILABLE = { status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'server_unavailable' }) }
const TITLE = 'The server is under maintenance or temporarily unavailable'
const GAME_TEXT = 'The server is under maintenance or temporarily unavailable. The game reconnects automatically when it is back; game progress is not lost.'

async function englishPage(page: Page) {
  await page.addInitScript(() => { localStorage.setItem('open-agricola-locale-v2', 'en') })
}
// Only the API itself: the dev server also serves source modules whose paths contain `/api/`.
const apiRequest = (url: URL) => url.pathname.startsWith('/api/')
const serverDown = (page: Page) => page.route(apiRequest, route => route.fulfill(UNAVAILABLE))
const serverBack = (page: Page) => page.unroute(apiRequest)

test('an unavailable server shows the maintenance page instead of the login form and returns when it answers', async ({ page }) => {
  await englishPage(page)
  await serverDown(page)
  await page.goto('/')
  const maintenance = page.getByTestId('server-maintenance')
  await expect(maintenance.getByRole('heading', { name: TITLE })).toBeVisible()
  await expect(maintenance).toContainText('Your account and game progress are not lost.')
  await expect(page.locator('input[type=password]')).toHaveCount(0)

  await serverBack(page)
  await maintenance.getByRole('button', { name: 'Retry now' }).click()
  await expect(page.locator('input[type=password]').first()).toBeVisible()
  await expect(maintenance).toHaveCount(0)
})

test('a login attempt during the outage shows the maintenance page, not a network error', async ({ page }) => {
  await englishPage(page)
  await page.goto('/')
  const password = page.locator('input[type=password]').first()
  await expect(password).toBeVisible()
  await page.locator('input').first().fill('maintenance_player')
  await password.fill('not-a-real-password')
  await serverDown(page)
  await page.locator('button[type=submit]').first().click()
  await expect(page.getByTestId('server-maintenance').getByRole('heading', { name: TITLE })).toBeVisible()
  await expect(page.getByText('Network error', { exact: true })).toHaveCount(0)
})

test('a game that loses an unavailable server keeps its board under the maintenance overlay and reconnects', async ({ page }) => {
  await englishPage(page)
  let down = false
  const sockets: Array<{ client: WebSocketRoute; server?: WebSocketRoute }> = []
  await page.routeWebSocket('**/ws', socket => {
    if (down) { void socket.close({ code: 1011, reason: 'server unavailable' }); return }
    sockets.push({ client: socket, server: socket.connectToServer() })
  })
  await page.goto('/?player=p1&transport=ws&room=dev5&devMode=1')
  const layout = page.locator('.game-layout')
  await expect(layout).toBeVisible({ timeout: 30_000 })

  down = true
  await serverDown(page)
  for (const socket of sockets.splice(0)) {
    await socket.client.close({ code: 1012, reason: 'maintenance test' })
    await socket.server?.close({ code: 1012, reason: 'maintenance test' })
  }
  const overlay = page.getByTestId('server-maintenance-overlay')
  await expect(overlay.getByRole('alert')).toHaveText(GAME_TEXT)
  // The last board stays visible underneath and cannot be operated.
  await expect(layout).toBeVisible()
  expect(await layout.evaluate(element => element.closest('[inert]') !== null)).toBe(true)

  down = false
  await serverBack(page)
  await expect(overlay).toHaveCount(0, { timeout: 45_000 })
  await expect(layout).toBeVisible()
  expect(sockets.length).toBeGreaterThan(0)
})

test('a game whose room cannot be found while the server is unavailable says so and starts over when it answers', async ({ page }) => {
  await englishPage(page)
  await serverDown(page)
  await page.goto('/?player=p1&transport=ws&room=dev5&devMode=1')
  // Room discovery fails before any WebSocket opens; the stopped transport cannot retry, so the page reloads on recovery.
  await expect(page.locator('.ws-status-text')).toHaveText(GAME_TEXT)
  await serverBack(page)
  await expect(page.locator('.game-layout')).toBeVisible({ timeout: 45_000 })
})
