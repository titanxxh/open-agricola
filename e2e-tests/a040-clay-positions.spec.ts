import { expect, test, type APIResponse, type Page } from '@playwright/test'
import type { GameSyncPayload } from '../shared/contract/protocol/game'
import type { ServerEvent } from '../shared/contract/protocol/ws'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'
import { BACKEND_URL, FRONTEND_URL } from './fixtures'

const CARD = 'A040_PottersYard'
const startingPositions = ['0-3', '0-4', '1-4', '2-3', '2-4']

declare global {
  interface Window {
    a040Payload?: GameSyncPayload
    a040Socket: WebSocket
    a040Scope: Extract<ServerEvent, { type: 'commandScope' }>['scope']
    a040Context: { roomId: string; expectedVersion: number; inputWindowId?: string }
  }
}

async function observe(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('open-agricola-locale-v2', 'en')
    const NativeWebSocket = window.WebSocket
    window.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols)
        window.a040Socket = this
        this.addEventListener('message', event => {
          const message: ServerEvent = JSON.parse(event.data)
          if (message.type === 'commandScope') window.a040Scope = message.scope
          if (message.type === 'stateUpdate') {
            window.a040Payload = message.payload
            window.a040Context = { roomId: message.roomId, expectedVersion: message.version,
              inputWindowId: message.inputWindow?.id }
          }
        })
      }
    }
  })
}

async function snapshot(page: Page) {
  const payload = await page.evaluate(() => window.a040Payload)
  if (!payload) throw new Error('Missing authoritative room state')
  return payload
}

function cookie(response: APIResponse, name: string) {
  const header = response.headersArray().find(entry => entry.name.toLowerCase() === 'set-cookie'
    && entry.value.startsWith(`${name}=`))
  if (!header) throw new Error(`Missing ${name} cookie`)
  return header.value.split(';')[0]!.slice(name.length + 1)
}

async function loadFixture(page: Page) {
  const fixture = createWorkSession({ seed: 42, options: {
    playerCount: 2, enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true,
  }, configure(state) {
    state.round = 3
    const previous = state.roundActionOrder.indexOf('major-improvement')
    if (previous < 0) throw new Error('Missing Major Improvement round card')
    ;[state.roundActionOrder[2], state.roundActionOrder[previous]] = [state.roundActionOrder[previous]!, state.roundActionOrder[2]!]
    for (const player of state.players) Object.assign(player.resources, { food: 20, fuel: 20 })
    const player = state.players[0]!
    player.minorHand = [CARD]
    Object.assign(player.resources, { wood: 20, reed: 10, clay: 0, stone: 20 })
  } })
  try {
    expect(fixture.state.players[0]!.minorPlayed).not.toContain(CARD)
    expect(fixture.state.players[0]!.cardStates[CARD]).toBeUndefined()
    expect(fixture.state.players[0]!.farmTerrain).toHaveLength(8)
    const state = fixture.withCtx(() => serializeState(fixture.state, {}))
    const version = await page.evaluate(async state => {
      const commandId = crypto.randomUUID()
      return new Promise<number>((resolve, reject) => {
        const receive = (event: MessageEvent) => {
          const message: ServerEvent = JSON.parse(event.data)
          if (message.type !== 'commandReceipt' || message.requestId !== commandId || message.status !== 'completed') return
          clearTimeout(timer)
          window.a040Socket.removeEventListener('message', receive)
          if (message.receipt.outcome.ok && typeof message.receipt.outcome.roomVersion === 'number') {
            resolve(message.receipt.outcome.roomVersion)
          } else reject(new Error('Fixture load rejected'))
        }
        const timer = setTimeout(() => { window.a040Socket.removeEventListener('message', receive)
          reject(new Error('Fixture load receipt timed out')) }, 10000)
        window.a040Socket.addEventListener('message', receive)
        window.a040Socket.send(JSON.stringify({ type: 'loadGame', state, requestId: commandId,
          commandContext: { ...window.a040Context, scopeId: window.a040Scope.scopeId, commandId } }))
      })
    }, state)
    await expect.poll(() => page.evaluate(() => window.a040Context.expectedVersion)).toBeGreaterThanOrEqual(version)
  } finally { fixture.dispose() }
}

const tokens = (payload: GameSyncPayload) => payload.state.players[0]!.farmyardSpaceStates
  ?.filter(token => token.sourceCardId === CARD && token.kind === 'farmyard-goods-token') ?? []
const clayPositions = (payload: GameSyncPayload) => tokens(payload).map(token => token.spaceKey).sort()
const cardGroups = (payload: GameSyncPayload) => payload.state.players[0]!.cardStatePresentation[CARD]?.resourceGroups
const playedCard = (page: Page) => page.locator('.played-card-slot')
  .filter({ has: page.locator(`[data-card-anchor="${CARD}"]`) })

async function expectRemaining(page: Page, observer: Page, amount: number, positions: string[]) {
  const groups = playedCard(page).locator('.card-resource-groups')
  await expect(groups.locator('.res-icon-clay')).toHaveCount(amount > 0 ? 1 : 0)
  if (amount > 0) await expect(groups).toHaveText(String(amount))
  for (const client of [page, observer]) {
    await expect.poll(async () => cardGroups(await snapshot(client))).toEqual(amount > 0 ? [{ clay: amount }] : [])
    await expect.poll(async () => clayPositions(await snapshot(client))).toEqual(positions)
  }
}

async function confirmSwitch(page: Page) {
  await page.locator('.interaction-bar').getByRole('button', { name: 'Confirm switch', exact: true }).click()
}

// A040 is bought through the UI, not injected as a played card. The browser
// proves the existing generic card display and real WS choices; Session tests
// carry the complete position-rule matrix because the board has no token renderer.
test('A040 pays for its clay positions, exchanges one claim and synchronizes the remaining supply', async ({ page, browser, request }) => {
  const observer = await browser.newPage()
  try {
    for (const [index, client] of [page, observer].entries()) {
      const username = `a040_${Date.now().toString(36)}_${index}`
      const oauth = await request.post(`${BACKEND_URL}/api/test/oauth/github/callback`, { data: {
        providerUserId: username, providerLogin: username, email: `${username}@example.com`, displayName: username,
      } })
      expect(oauth.ok()).toBe(true)
      const complete = await request.post(`${BACKEND_URL}/api/auth/onboarding/complete`, {
        headers: { Cookie: `oa_onboarding=${cookie(oauth, 'oa_onboarding')}` },
        data: { username, displayName: username, password: 'a040-browser-pass', confirmPassword: 'a040-browser-pass' },
      })
      expect(complete.ok()).toBe(true)
      await client.context().addCookies([{ name: 'oa_session', value: cookie(complete, 'oa_session'), url: FRONTEND_URL }])
      await observe(client)
      await client.goto(`${FRONTEND_URL}/?player=p${index + 1}&transport=ws&room=dev2&devMode=1`)
      await expect(client.locator('.game-layout')).toBeVisible({ timeout: 30000 })
    }
    await loadFixture(page)
    const improvement = page.locator('[data-action-id="major-improvement"] button').first()
    await expect(improvement).toBeEnabled()
    await improvement.click()
    await page.locator(`.interaction-bar [data-choice-value="${CARD}"]`).click()
    await expect.poll(async () => (await snapshot(page)).state.players[0]!.minorPlayed).toContain(CARD)
    expect((await snapshot(page)).state.players[0]!.resources).toMatchObject({ wood: 19, reed: 9, clay: 0, food: 20 })
    await expectRemaining(page, observer, 5, startingPositions)
    expect(tokens(await snapshot(page))).toEqual(expect.arrayContaining(startingPositions.map(spaceKey =>
      expect.objectContaining({ spaceKey, kind: 'farmyard-goods-token', sourceCardId: CARD,
        resources: { clay: 1 }, claimPolicy: 'when-no-longer-unused' }))))
    await page.reload()
    await expectRemaining(page, observer, 5, startingPositions)

    await confirmSwitch(observer)
    await observer.locator('[data-action-id="day-laborer"] button').first().click()
    await confirmSwitch(page)
    await page.locator('[data-action-id="farmland"] button').first().click()
    await page.locator('[data-farm-tile-player="p1"][data-farm-tile-key="0-3"]').click()
    await page.getByRole('button', { name: 'Confirm plow', exact: true }).click()
    await expect.poll(async () => (await snapshot(page)).state.players[0]!.resources.clay).toBe(1)
    await expectRemaining(page, observer, 4, ['0-4', '1-4', '2-3', '2-4'])
    const current = await snapshot(page)
    if (current.interaction.stateId !== 'wait') throw new Error('Missing optional clay exchange')
    const exchange = current.interaction.request.options.find(option => !option.disabled && !option.value.startsWith('__'))
    expect(exchange).toBeDefined()
    if (!exchange) throw new Error('Missing clay-to-food exchange option')
    await expect(page.locator('.interaction-bar [data-choice-value="__skip__"]')).toBeEnabled()
    const exchangeButton = page.locator(`.interaction-bar [data-choice-value="${exchange.value}"]`)
    await expect(exchangeButton.locator('.res-icon-clay')).toBeVisible()
    await expect(exchangeButton.locator('.res-icon-food')).toBeVisible()
    await exchangeButton.click()
    for (const client of [page, observer]) {
      await expect.poll(async () => (await snapshot(client)).state.players[0]!.resources)
        .toMatchObject({ clay: 0, food: 22, wood: 19, reed: 9 })
    }
    await page.reload()
    await observer.reload()
    await expectRemaining(page, observer, 4, ['0-4', '1-4', '2-3', '2-4'])
    const completed = await snapshot(page)
    expect(completed.state.players[0]!.fields).toContainEqual(expect.objectContaining({ row: 0, col: 3 }))
    expect(completed.state.events.filter(event => event.type === 'resource.paid' && event.returnedCardId === undefined
      && event.resources.wood === 1 && event.resources.reed === 1)).toHaveLength(1)
    await expect(page.locator('.interaction-bar')).toContainText('Confirm switch')
    await confirmSwitch(observer)
  } finally { await observer.close() }
})
