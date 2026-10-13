import { expect, test, type Page, type APIResponse } from '@playwright/test'
import type { GameSyncPayload } from '../shared/contract/protocol/game'
import type { ServerEvent } from '../shared/contract/protocol/ws'
import { BACKEND_URL, FRONTEND_URL } from './fixtures'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'

declare global {
  interface Window {
    roomHolderPayload?: GameSyncPayload
    roomHolderSocket: WebSocket
    roomHolderScope: Extract<ServerEvent, { type: 'commandScope' }>['scope']
    roomHolderContext: { roomId: string; expectedVersion: number; inputWindowId?: string }
  }
}

async function observe(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('open-agricola-locale-v2', 'en')
    const NativeWebSocket = window.WebSocket
    window.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols)
        window.roomHolderSocket = this
        this.addEventListener('message', event => {
          const message: ServerEvent = JSON.parse(event.data)
          if (message.type === 'commandScope') window.roomHolderScope = message.scope
          if (message.type === 'stateUpdate') {
            window.roomHolderPayload = message.payload
            window.roomHolderContext = { roomId: message.roomId, expectedVersion: message.version, inputWindowId: message.inputWindow?.id }
          }
        })
      }
    }
  })
}

const cookie = (response: APIResponse, name: string) => response.headersArray()
  .find(header => header.name.toLowerCase() === 'set-cookie' && header.value.startsWith(`${name}=`))!
  .value.split(';')[0]!.slice(name.length + 1)

async function command(page: Page, body: Record<string, unknown>) {
  return page.evaluate(async input => {
    const commandId = crypto.randomUUID()
    return new Promise<Extract<ServerEvent, { type: 'commandReceipt'; status: 'completed' }>>((resolve, reject) => {
      const receive = (event: MessageEvent) => {
        const message: ServerEvent = JSON.parse(event.data)
        if (message.type !== 'commandReceipt' || message.requestId !== commandId || message.status !== 'completed') return
        clearTimeout(timer)
        window.roomHolderSocket.removeEventListener('message', receive)
        resolve(message)
      }
      const timer = setTimeout(() => { window.roomHolderSocket.removeEventListener('message', receive); reject(new Error('Command receipt timed out')) }, 10000)
      window.roomHolderSocket.addEventListener('message', receive)
      window.roomHolderSocket.send(JSON.stringify({ ...input, requestId: commandId, commandContext: {
        ...window.roomHolderContext, scopeId: window.roomHolderScope.scopeId, commandId,
      } }))
    })
  }, body)
}

test('room assignments can be edited separately, remain after reload, and synchronize to another client', async ({ page, browser, request }) => {
  const observer = await browser.newPage()
  try {
    for (const [index, client] of [page, observer].entries()) {
      const username = `room_holders_${Date.now().toString(36)}_${index}`
      const oauth = await request.post(`${BACKEND_URL}/api/test/oauth/github/callback`, { data: {
        providerUserId: username, providerLogin: username, email: `${username}@example.com`, displayName: username,
      } })
      expect(oauth.ok()).toBe(true)
      const complete = await request.post(`${BACKEND_URL}/api/auth/onboarding/complete`, {
        headers: { Cookie: `oa_onboarding=${cookie(oauth, 'oa_onboarding')}` },
        data: { username, displayName: username, password: 'room-holder-pass', confirmPassword: 'room-holder-pass' },
      })
      expect(complete.ok()).toBe(true)
      await client.context().addCookies([{ name: 'oa_session', value: cookie(complete, 'oa_session'), url: FRONTEND_URL }])
      await observe(client)
      await client.goto(`${FRONTEND_URL}/?player=p${index + 1}&transport=ws&room=dev2&devMode=1`)
      await expect(client.locator('.game-layout')).toBeVisible({ timeout: 30000 })
    }
    const fixture = createWorkSession({ seed: 42, configure(state) {
      state.round = 8
      const prior = state.roundActionOrder.indexOf('pig-market')
      ;[state.roundActionOrder[7], state.roundActionOrder[prior]] = [state.roundActionOrder[prior]!, state.roundActionOrder[7]!]
      for (const player of state.players) player.resources.food = 20
      const owner = state.players[0]!
      owner.occupationPlayed = ['A086_AnimalTamer']
      owner.rooms = 2
      owner.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }]
      owner.houseAnimals = { '0-0': 'sheep' }
      Object.assign(owner.resources, { sheep: 1, boar: 0, cattle: 0 })
      state.actionSpaces.find(space => space.id === 'pig-market')!.resources.boar = 1
    } })
    try {
      const loaded = await command(page, { type: 'loadGame', state: fixture.withCtx(() => serializeState(fixture.state, {})) })
      expect(loaded.receipt.outcome.ok).toBe(true)
    } finally { fixture.dispose() }
    await expect(page.getByTestId('room-animal-0-0').locator('.res-icon-sheep')).toBeVisible()
    await page.locator('[data-action-id="pig-market"] button').first().click()
    await expect(page.locator('.interaction-reorg-panel')).toBeVisible()
    const pigRoom = page.getByTestId('room-animal-1-0')
    const pigControl = pigRoom.locator('.pasture-control-row').filter({ hasText: /Boar|Pig/i })
    await pigControl.getByRole('button', { name: '-', exact: true }).click()
    await expect(pigRoom.locator('.res-icon-boar')).toHaveCount(0)
    await pigControl.getByRole('button', { name: '+', exact: true }).click()
    await expect(pigRoom.locator('.res-icon-boar')).toBeVisible()

    const before = await page.evaluate(() => window.roomHolderPayload!.state.players[0]!.houseAnimals)
    const rejected = await command(page, {
      type: 'choice', value: 'confirm', payload: { zones: [
        { id: 'house:0-0', zoneType: 'house', animalType: 'sheep', animalCount: 2 },
      ] },
    })
    expect(rejected.receipt.outcome.ok).toBe(false)
    expect(await page.evaluate(() => window.roomHolderPayload!.state.players[0]!.houseAnimals)).toEqual(before)
    await page.locator('.interaction-reorg-panel').getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(page.locator('.interaction-reorg-panel')).toHaveCount(0)
    await expect.poll(() => observer.evaluate(() => window.roomHolderPayload?.state.players[0].houseAnimals))
      .toEqual({ '0-0': 'sheep', '1-0': 'boar' })
    await page.reload()
    await expect(page.getByTestId('room-animal-0-0').locator('.res-icon-sheep')).toBeVisible()
    await expect(page.getByTestId('room-animal-1-0').locator('.res-icon-boar')).toBeVisible()
  } finally {
    await observer.close()
  }
})
