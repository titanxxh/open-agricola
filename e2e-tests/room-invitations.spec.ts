import { expect, test, type APIResponse, type BrowserContext, type Page } from '@playwright/test'
import { BACKEND_URL, FRONTEND_URL } from './fixtures'
import type { MyActiveRoom } from '../shared/contract/lobby'
import type { GameSyncPayload } from '../shared/contract/protocol/game'
import type { ServerEvent } from '../shared/contract/protocol/ws'

const cookieValue = (response: APIResponse, name: string): string => {
  const header = response.headersArray().find(entry => entry.name.toLowerCase() === 'set-cookie' && entry.value.startsWith(`${name}=`))
  if (!header) throw new Error(`Missing ${name} cookie`)
  return header.value.split(';')[0]!.slice(name.length + 1)
}

async function authenticate(context: BrowserContext, username: string, displayName = username) {
  const oauth = await context.request.post(`${BACKEND_URL}/api/test/oauth/github/callback`, {
    data: { providerUserId: `invite-${username}`, providerLogin: username, email: `${username}@example.com`, displayName },
  })
  expect(oauth.ok()).toBe(true)
  const complete = await context.request.post(`${BACKEND_URL}/api/auth/onboarding/complete`, {
    headers: { Cookie: `oa_onboarding=${cookieValue(oauth, 'oa_onboarding')}` },
    data: { username, displayName, password: 'invite-pass-550', confirmPassword: 'invite-pass-550' },
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
  test(`invited rooms search player names, enforce admission and show resumable game details (${viewport.name})`, async ({ browser }, testInfo) => {
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
      const guestName = `iv_guest_${suffix}`
      const guestDisplayName = `农友${suffix}`
      const guestId = await authenticate(guest, guestName, guestDisplayName)
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
      const input = page.getByRole('combobox', { name: '受邀玩家', exact: true })
      await input.fill(guestName.slice(0, 1))
      await page.waitForTimeout(300)
      expect(searchRequests).toEqual([])
      await input.fill(guestName.slice(0, 2).toUpperCase())
      const option = page.getByRole('option').filter({ hasText: guestName })
      await expect(option).toBeVisible()
      await expect(option).toContainText(guestDisplayName)
      await expect(option).not.toContainText(guestId)
      expect(searchRequests.length).toBeGreaterThan(0)
      await input.fill('农友')
      await expect(option).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath('player-name-dropdown.png'), fullPage: true })
      await option.click()
      await expect(input).toHaveValue('')
      await expect(page.locator('.room-invite-chip')).toContainText(guestDisplayName)
      await expect(page.locator('.room-invitations')).not.toContainText(guestId)
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
      const synced: { latest?: GameSyncPayload } = {}
      guestPage.on('websocket', socket => socket.on('framereceived', event => {
        const message: ServerEvent = JSON.parse(event.payload.toString())
        if (message.type === 'stateUpdate') synced.latest = message.payload
      }))
      await guestPage.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded' })
      await expect(guestPage.locator('.room-item').filter({ hasText: roomId })).toBeVisible()
      await page.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('.my-game')).toContainText('创建于')
      await expect(page.locator('.my-game')).not.toContainText(roomId)
      await page.locator('.my-game').getByRole('button', { name: /继续/ }).click()
      await expect(page.locator('.ws-invite-roomid strong')).toHaveText(roomId)
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
      await expect(guestPage.locator('.ws-invite-player')).toHaveCount(2)
      await expect(page.locator('.game-layout')).toHaveCount(0)
      await expect(guestPage.locator('.game-layout')).toHaveCount(0)
      await expect(page.getByRole('button', { name: '确认颜色并开始', exact: true })).toHaveCount(0)
      await guestPage.locator('.ws-color-option[data-player-color=green]').click()
      await expect(page.locator('.ws-invite-player').filter({ hasText: guestDisplayName })).toHaveAttribute('data-player-color', 'green')
      await guestPage.reload({ waitUntil: 'domcontentloaded' })
      await expect(guestPage.locator('.ws-color-option[data-player-color=green]')).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByRole('status')).toContainText('确认颜色后开始')
      await guestPage.screenshot({ path: testInfo.outputPath('final-player-color.png'), fullPage: true })
      await guestPage.getByRole('button', { name: '确认颜色并开始', exact: true }).click()
      await expect(page.locator('.game-layout')).toBeVisible({ timeout: 20_000 })
      await expect(guestPage.locator('.game-layout')).toBeVisible({ timeout: 20_000 })
      await guestPage.reload({ waitUntil: 'domcontentloaded' })
      await expect(guestPage.locator('.game-layout')).toBeVisible({ timeout: 20_000 })
      expect(new URL(guestPage.url()).search).toBe(`?room=${roomId}`)
      expect(await roomIds(outsider)).not.toContain(roomId)
      if (!synced.latest) throw new Error('Expected an authoritative state update')
      const { state, interaction } = synced.latest
      const actor = interaction.stateId === 'wait' && typeof interaction.playerIndex === 'number'
        ? interaction.playerIndex : state.currentPlayerIndex
      const myRooms = await creator.request.get(`${BACKEND_URL}/api/lobby/my-rooms`)
      expect(myRooms.headers()['cache-control']).toBe('no-store')
      const summary: { rooms: MyActiveRoom[] } = await myRooms.json()
      const active = summary.rooms.find(room => room.id === roomId)
      expect(active?.current_player_index).toBe(actor)
      const hostIndex = state.players.findIndex(player => player.name === `iv_host_${suffix}`)
      const guestIndex = state.players.findIndex(player => player.name === guestDisplayName)
      expect(hostIndex).toBeGreaterThanOrEqual(0)
      expect(guestIndex).toBeGreaterThanOrEqual(0)
      expect(active?.players[guestIndex]?.color).toBe('green')
      expect(active?.players[hostIndex]?.color).toBe(state.players[hostIndex]!.color)
      expect(active?.started_at).not.toBeNull()
      await page.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded' })
      const game = page.locator('.my-game')
      await expect(game.locator('.my-game__name')).toHaveText(state.players.map(player => player.name))
      await expect(game.locator('[data-player-color=green]')).toBeVisible()
      await expect(game).toContainText('开始于')
      await expect(game).not.toContainText(roomId)
      if (!active?.started_at) throw new Error('Expected the persisted start time')
      await expect(game.locator('time')).toHaveAttribute('datetime', new Date(active.started_at).toISOString())
      if (actor === hostIndex) await expect(game.locator('.my-game__turn')).toHaveAttribute('data-my-turn', 'true')
      else await expect(game.locator('.my-game__turn')).toContainText(guestDisplayName)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await game.screenshot({ path: testInfo.outputPath('my-active-game.png') })
      await game.getByRole('button', { name: /继续/ }).click()
      await expect(page.locator('.game-layout')).toBeVisible({ timeout: 20_000 })
      expect(new URL(page.url()).search).toBe(`?room=${roomId}`)
    } finally {
      await Promise.all(contexts.map(context => context.close()))
    }
  })
}

test('player search requires authentication and two literal name characters; unknown guests reject creation', async ({ browser, request }) => {
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
    await expect(page.getByRole('alert')).toContainText('受邀玩家不存在或账号不可用')
    expect(await roomIds(context)).toEqual(before)
  } finally { await context.close() }
})
