import { authCookieNames } from '../server/auth-cookies'
// @covers client/styles/pages/
// @covers server/connection/
import { expect, test, type APIResponse, type BrowserContext, type Page } from '@playwright/test'
import { browserRequestHeaders, BACKEND_URL, FRONTEND_URL, openGameEndControls } from './fixtures'
import type { Locale } from '../shared/i18n'
import type { ServerEvent } from '../shared/contract/protocol/ws'
import type { StateUpdateEnvelope } from '../shared/contract/protocol/game'

test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 })

const cookie = (response: APIResponse, name: string) => {
  const header = response.headersArray().find(item => item.name.toLowerCase() === 'set-cookie' && item.value.startsWith(`${name}=`))
  if (!header) throw new Error(`Missing ${name} cookie`)
  return header.value.split(';')[0]!.slice(name.length + 1)
}

async function authenticate(context: BrowserContext, name: string, locale: Locale) {
  const oauth = await context.request.post(`${BACKEND_URL}/api/test/oauth/github/callback`, { headers: browserRequestHeaders(), data: {
    providerUserId: name, providerLogin: name, email: `${name}@example.com`, displayName: name,
  } })
  expect(oauth.ok()).toBe(true)
  const account = await context.request.post(`${BACKEND_URL}/api/auth/onboarding/complete`, {
    headers: { ...browserRequestHeaders(), Cookie: `${authCookieNames().onboarding}=${cookie(oauth, authCookieNames().onboarding)}` },
    data: { username: name, displayName: name, password: 'spectating-test-pass', confirmPassword: 'spectating-test-pass' },
  })
  expect(account.ok(), await account.text()).toBe(true)
  await context.addCookies([{ name: authCookieNames().session, value: cookie(account, authCookieNames().session), url: FRONTEND_URL }])
  await context.addInitScript(locale => localStorage.setItem('open-agricola-locale-v2', locale), locale)
}

function observe(page: Page) {
  const recorded: { latest?: StateUpdateEnvelope; messages: ServerEvent[]; sent: string[] } = { messages: [], sent: [] }
  page.on('websocket', socket => {
    socket.on('framereceived', event => {
      const message: ServerEvent = JSON.parse(event.payload.toString())
      recorded.messages.push(message)
      if (message.type === 'stateUpdate') recorded.latest = message
    })
    socket.on('framesent', event => {
      const message: { type: string } = JSON.parse(event.payload.toString())
      recorded.sent.push(message.type)
    })
  })
  return recorded
}

for (const device of [
  { name: 'desktop', width: 1440, height: 1000, locale: 'en', labels: {
    createMultiplayer: 'Create Multiplayer Game', createGame: 'Create Game', confirmColorAndStart: 'Confirm color and start',
    spectateBtn: 'Spectate', live: 'Spectating public information', offline: 'All players are offline. Spectating has stopped.',
    backToLobbyPlain: 'Back to Lobby', bug: 'Report a bug',
  } },
  { name: 'mobile', width: 390, height: 844, locale: 'zh', labels: {
    createMultiplayer: '创建多人游戏', createGame: '创建游戏', confirmColorAndStart: '确认颜色并开始',
    spectateBtn: '旁观', live: '旁观中，仅展示公开信息', offline: '所有玩家已离线，旁观已停止。',
    backToLobbyPlain: '返回大厅', bug: '报告问题',
  } },
] as const) {
  test(`live spectating stays public and read-only on ${device.name}`, async ({ browser }, testInfo) => {
    const contexts: BrowserContext[] = []
    try {
      for (let index = 0; index < 3; index++) {
        const context = await browser.newContext({ viewport: { width: device.width, height: device.height },
          ...(device.name === 'mobile' ? { isMobile: true, hasTouch: true } : {}) })
        contexts.push(context)
        await authenticate(context, `watch_${crypto.randomUUID().slice(0, 8)}_${index}`, device.locale)
      }
      const owner = await contexts[0]!.newPage()
      const guest = await contexts[1]!.newPage()
      const viewer = await contexts[2]!.newPage()
      const first = observe(owner)
      const second = observe(guest)
      const watched = observe(viewer)
      await owner.goto(`${FRONTEND_URL}/?page=lobby`, { waitUntil: 'domcontentloaded' })
      await owner.getByRole('button', { name: device.labels.createMultiplayer, exact: true }).click()
      await owner.getByRole('button', { name: device.labels.createGame, exact: true }).click()
      const roomId = await owner.locator('.ws-invite-roomid strong').textContent()
      if (!roomId) throw new Error('No room was created')
      await guest.goto(`${FRONTEND_URL}/?room=${roomId}`, { waitUntil: 'domcontentloaded' })
      await guest.getByRole('button', { name: device.labels.confirmColorAndStart, exact: true }).click()
      await expect(owner.locator('.game-layout')).toBeVisible()
      await expect(guest.locator('.game-layout')).toBeVisible()

      await viewer.goto(`${FRONTEND_URL}/?page=lobby`, { waitUntil: 'domcontentloaded' })
      const listing = viewer.locator('.room-item').filter({ hasText: roomId })
      await listing.getByRole('button', { name: device.labels.spectateBtn, exact: true }).click()
      await expect(viewer.getByTestId('spectating-status')).toContainText(device.labels.live)
      await expect(viewer.locator('.game-layout')).toBeVisible()
      await expect.poll(() => watched.latest?.roomId).toBe(roomId)
      const hiddenIds = [first.latest, second.latest].flatMap(envelope => envelope?.payload.state.players.flatMap(player =>
        [...player.occupationHand, ...player.minorHand].filter(id => id !== '?')) ?? [])
      expect(hiddenIds.length).toBeGreaterThan(0)
      for (const id of hiddenIds) expect(JSON.stringify(watched.latest)).not.toContain(id)
      expect(watched.latest?.payload.interaction.allowedCommands).toEqual([])
      await expect(viewer.getByRole('button', { name: device.labels.bug, exact: true })).toHaveCount(0)
      await expect(viewer.locator('[data-action-id="forest"] button').first()).toBeDisabled()
      await expect(viewer.locator('.player-tabs__tab.is-you')).toHaveCount(0)
      const tabs = viewer.locator('.player-tabs__tab').filter({ visible: true })
      for (const tab of await tabs.all()) {
        await tab.click()
        await expect(tab).toHaveAttribute('aria-selected', 'true')
        await expect(viewer.locator('[data-action-id="forest"] button').first()).toBeDisabled()
      }
      await viewer.reload({ waitUntil: 'domcontentloaded' })
      await expect(viewer.getByTestId('spectating-status')).toContainText(device.labels.live)
      expect(watched.messages.filter(event => event.type === 'roomSpectated').length).toBeGreaterThanOrEqual(2)
      expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await viewer.screenshot({ path: testInfo.outputPath('public-spectating.png'), fullPage: true })

      const latest = first.latest
      if (!latest) throw new Error('Owner has no snapshot')
      const ownerSeat = first.messages.find(event => event.type === 'roomCreated')
      if (!ownerSeat || ownerSeat.type !== 'roomCreated') throw new Error('Owner has no seat')
      for (let step = 0; step < 8; step++) {
        const opening = first.latest!.payload
        if (opening.state.roundPhase !== 'preparation') break
        if (opening.interaction.stateId !== 'wait') throw new Error('Opening has no interaction owner')
        const actorRecord = ownerSeat.playerIndex === opening.interaction.playerIndex ? first : second
        const actorPage = actorRecord === first ? owner : guest
        const prompt = actorRecord.latest!.payload.interaction
        if (prompt.stateId !== 'wait' || prompt.request.kind !== 'choice'
          || !prompt.request.options.some(option => option.value === '__skip__' && !option.disabled)) {
          throw new Error('Expected an optional opening offer on its owning seat')
        }
        const openingVersion = watched.latest!.version
        await actorPage.locator('[data-choice-value="__skip__"]').click()
        for (const record of [first, second, watched]) await expect.poll(() => record.latest?.version ?? 0).toBeGreaterThan(openingVersion)
      }
      expect(first.latest!.payload.state.roundPhase).toBe('work')
      const actor = first.latest!.payload.state.currentPlayerIndex
      const actingPage = ownerSeat.playerIndex === actor ? owner : guest
      const before = watched.latest!.version
      await actingPage.locator('[data-action-id="forest"] button').first().click()
      await expect.poll(() => watched.latest?.version ?? 0).toBeGreaterThan(before)
      for (const id of hiddenIds) expect(JSON.stringify(watched.latest)).not.toContain(id)
      expect(watched.sent.every(type => ['getCommandScope', 'joinRoom', 'spectateRoom', 'getState', 'getHistory'].includes(type))).toBe(true)

      if (device.name === 'desktop') {
        owner.on('dialog', dialog => dialog.accept())
        await (await openGameEndControls(owner)).getByRole('button', { name: 'Propose ending the game', exact: true }).click()
        await (await openGameEndControls(guest)).getByRole('button', { name: 'Agree', exact: true }).click()
        await expect(viewer.getByTestId('spectating-status')).toContainText('The players ended this game.')
        await viewer.getByRole('button', { name: 'View replay', exact: true }).click()
        await expect(viewer.getByRole('heading', { name: 'Ended by agreement', exact: true })).toBeVisible()
        await viewer.screenshot({ path: testInfo.outputPath('spectating-replay.png'), fullPage: true })
      } else {
        await contexts[0]!.close()
        await contexts[1]!.close()
        await expect(viewer.getByTestId('spectating-status')).toContainText(device.labels.offline)
        await expect(viewer.locator('.game-layout')).toBeVisible()
        await viewer.screenshot({ path: testInfo.outputPath('spectating-offline.png'), fullPage: true })
        await viewer.getByTestId('spectating-status').getByRole('button', { name: device.labels.backToLobbyPlain, exact: true }).click()
        await expect(viewer.getByRole('button', { name: device.labels.createMultiplayer, exact: true })).toBeVisible()
      }
    } finally {
      for (const context of contexts) await context.close()
    }
  })
}
