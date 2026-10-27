import { expect, test, type APIResponse, type BrowserContext, type Page } from '@playwright/test'
import { BACKEND_URL, FRONTEND_URL } from './fixtures'

const cookieValue = (response: APIResponse, name: string): string => {
  const header = response.headersArray().find(entry => entry.name.toLowerCase() === 'set-cookie' && entry.value.startsWith(`${name}=`))
  if (!header) throw new Error(`Missing ${name} cookie`)
  return header.value.split(';')[0]!.slice(name.length + 1)
}

async function authenticate(context: BrowserContext, username: string) {
  const oauth = await context.request.post(`${BACKEND_URL}/api/test/oauth/github/callback`, {
    data: { providerUserId: `invite-${username}`, providerLogin: username, email: `${username}@example.com`, displayName: username },
  })
  expect(oauth.ok()).toBe(true)
  const complete = await context.request.post(`${BACKEND_URL}/api/auth/onboarding/complete`, {
    headers: { Cookie: `oa_onboarding=${cookieValue(oauth, 'oa_onboarding')}` },
    data: { username, displayName: username, password: 'invite-pass-550', confirmPassword: 'invite-pass-550' },
  })
  expect(complete.ok(), await complete.text()).toBe(true)
  await context.addCookies([{ name: 'oa_session', value: cookieValue(complete, 'oa_session'), url: FRONTEND_URL }])
  const me = await context.request.get(`${BACKEND_URL}/api/auth/me`)
  const body = await me.json() as { user: { id: string } }
  return body.user.id
}

async function roomIds(context: BrowserContext) {
  const response = await context.request.get(`${BACKEND_URL}/api/rooms`)
  expect(response.headers()['cache-control']).toBe('no-store')
  const body = await response.json() as { rooms: Array<{ id: string }> }
  return body.rooms.map(room => room.id)
}

async function directJoin(page: Page, wsPath: string, roomId: string) {
  return page.evaluate(({ address, id }) => new Promise<Array<{ type: string; code?: string }>>((resolve, reject) => {
    const socket = new WebSocket(address)
    const received: Array<{ type: string; code?: string }> = []
    const timer = setTimeout(() => { socket.close(); reject(new Error('Direct join timed out')) }, 10_000)
    socket.onopen = () => socket.send(JSON.stringify({ type: 'joinRoom', roomId: id, name: 'Outsider' }))
    socket.onmessage = event => {
      const message = JSON.parse(String(event.data)) as { type: string; code?: string }
      received.push({ type: message.type, ...(message.code ? { code: message.code } : {}) })
      if (message.type === 'error' || message.type === 'roomJoined') {
        clearTimeout(timer)
        socket.close()
        resolve(received)
      }
    }
    socket.onerror = () => { clearTimeout(timer); reject(new Error('Direct socket failed')) }
  }), { address: `${BACKEND_URL.replace(/^http/u, 'ws')}${wsPath}`, id: roomId })
}

for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`invited rooms use player ID autocomplete and enforce admission (${viewport.name})`, async ({ browser }, testInfo) => {
    const contexts: BrowserContext[] = []
    try {
      const device = { viewport: { width: viewport.width, height: viewport.height },
        ...(viewport.name === 'mobile' ? { isMobile: true, hasTouch: true } : {}) }
      const creator = await browser.newContext({ ...device, permissions: ['clipboard-read', 'clipboard-write'] })
      const guest = await browser.newContext(device)
      const outsider = await browser.newContext(device)
      const anonymous = await browser.newContext(device)
      contexts.push(creator, guest, outsider, anonymous)
      const suffix = `${Date.now().toString(36)}_${viewport.name.slice(0, 1)}`
      const creatorId = await authenticate(creator, `iv_host_${suffix}`)
      const guestId = await authenticate(guest, `iv_guest_${suffix}`)
      await authenticate(outsider, `iv_other_${suffix}`)
      const page = await creator.newPage()
      await page.goto(`${FRONTEND_URL}/?page=settings`, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('.player-account-id code')).toHaveText(creatorId)
      await page.getByRole('button', { name: '复制玩家 ID', exact: true }).click()
      await expect(page.getByRole('status')).toHaveText('已复制玩家 ID')
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(creatorId)
      await page.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded' })
      await page.getByRole('button', { name: '创建多人游戏', exact: true }).click()
      await page.getByRole('radio', { name: '仅邀请玩家', exact: true }).check()
      const searchRequests: string[] = []
      page.on('request', request => { if (request.url().includes('/api/lobby/players?')) searchRequests.push(request.url()) })
      const input = page.getByRole('combobox', { name: '受邀玩家 ID' })
      await input.fill(guestId.slice(0, 1))
      await page.waitForTimeout(300)
      expect(searchRequests).toEqual([])
      await input.fill(guestId.slice(0, 2))
      const option = page.getByRole('option').filter({ hasText: guestId })
      await expect(option).toBeVisible()
      await expect(option).toContainText(`iv_guest_${suffix}`)
      expect(searchRequests.length).toBeGreaterThan(0)
      await page.screenshot({ path: testInfo.outputPath('player-id-dropdown.png'), fullPage: true })
      await option.click()
      await expect(input).toHaveValue(`${guestId}, `)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await page.getByRole('button', { name: '创建游戏', exact: true }).click()
      const roomId = await page.locator('.ws-invite-roomid strong').textContent()
      expect(roomId).toBeTruthy()
      if (!roomId) throw new Error('Room was not created')
      expect(new URL(page.url()).search).toBe(`?room=${roomId}`)
      expect(await roomIds(creator)).toContain(roomId)
      expect(await roomIds(guest)).toContain(roomId)
      expect(await roomIds(outsider)).not.toContain(roomId)
      expect(await roomIds(anonymous)).not.toContain(roomId)
      const guestPage = await guest.newPage()
      await guestPage.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded' })
      await expect(guestPage.locator('.room-item').filter({ hasText: roomId })).toBeVisible()
      const outsiderPage = await outsider.newPage()
      await outsiderPage.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded' })
      await expect(outsiderPage.locator('.room-item').filter({ hasText: roomId })).toHaveCount(0)
      const denied = await outsider.request.post(`${BACKEND_URL}/api/rooms/locate`, { data: { roomId } })
      expect(denied.status()).toBe(403)
      const contextDenied = await outsider.request.get(`${BACKEND_URL}/api/v1/game-contexts/${roomId}`)
      expect(contextDenied.status()).toBe(403)
      const located = await creator.request.post(`${BACKEND_URL}/api/rooms/locate`, { data: { roomId } })
      const route = await located.json() as { wsPath: string }
      const directEvents = await directJoin(outsiderPage, route.wsPath, roomId)
      expect(directEvents).toContainEqual({ type: 'error', code: 'not_participant' })
      expect(directEvents.some(event => event.type === 'stateUpdate' || event.type === 'roomJoined')).toBe(false)
      await outsiderPage.goto(`${FRONTEND_URL}/?room=${roomId}`, { waitUntil: 'domcontentloaded' })
      await expect(outsiderPage.getByRole('alert')).toContainText('当前账号无权进入此房间')
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.locator('.ws-invite-roomid strong')).toHaveText(roomId)
      await guestPage.locator('.room-item').filter({ hasText: roomId }).getByRole('button', { name: '加入', exact: true }).click()
      await expect(page.locator('.game-layout')).toBeVisible({ timeout: 20_000 })
      await expect(guestPage.locator('.game-layout')).toBeVisible({ timeout: 20_000 })
      await guestPage.reload({ waitUntil: 'domcontentloaded' })
      await expect(guestPage.locator('.game-layout')).toBeVisible({ timeout: 20_000 })
      expect(new URL(guestPage.url()).search).toBe(`?room=${roomId}`)
      expect(await roomIds(outsider)).not.toContain(roomId)
    } finally {
      await Promise.all(contexts.map(context => context.close()))
    }
  })
}

test('player search requires authentication and two literal ID characters; unknown guests reject creation', async ({ browser, request }) => {
  const anonymous = await request.get(`${BACKEND_URL}/api/lobby/players?prefix=ab`)
  expect(anonymous.status()).toBe(401)
  const context = await browser.newContext()
  try {
    await authenticate(context, `iv_invalid_${Date.now().toString(36)}`)
    const short = await context.request.get(`${BACKEND_URL}/api/lobby/players?prefix=a`)
    expect(short.status()).toBe(400)
    const wildcard = await context.request.get(`${BACKEND_URL}/api/lobby/players?prefix=%25%25`)
    expect(await wildcard.json()).toEqual({ ok: true, players: [] })
    const before = await roomIds(context)
    const page = await context.newPage()
    await page.goto(`${FRONTEND_URL}/?transport=ws&maxPlayers=2&roomAccess=invited&invitedUserIds=nonexistent-player-id`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('alert')).toContainText('受邀玩家 ID 不存在或账号不可用')
    expect(await roomIds(context)).toEqual(before)
  } finally { await context.close() }
})
