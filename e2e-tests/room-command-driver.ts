import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test'
import type { GameSyncPayload } from '../shared/contract/protocol/game'
import type { ClientCommand, ServerEvent } from '../shared/contract/protocol/ws'
import { BACKEND_URL, FRONTEND_URL } from './fixtures'

declare global {
  interface Window {
    lifecycleSocket: WebSocket
    lifecycleMessages: ServerEvent[]
    lifecycleUpdate?: Extract<ServerEvent, { type: 'stateUpdate' }>
  }
}

const cookie = (response: APIResponse, name: string) => {
  const header = response.headersArray().find(header =>
    header.name.toLowerCase() === 'set-cookie' && header.value.startsWith(`${name}=`),
  )
  if (!header) throw new Error(`Missing ${name} cookie`)
  return header.value.split(';')[0]!.slice(name.length + 1)
}

export async function joinRoomClients(pages: [Page, Page], request: APIRequestContext) {
  const suffix = crypto.randomUUID().slice(0, 8)
  for (const [index, page] of pages.entries()) {
    const username = `lifecycle_${suffix}_${index}`
    const oauth = await request.post(`${BACKEND_URL}/api/test/oauth/github/callback`, { data: {
      providerUserId: username, providerLogin: username, email: `${username}@example.com`, displayName: username,
    } })
    expect(oauth.ok()).toBe(true)
    const account = await request.post(`${BACKEND_URL}/api/auth/onboarding/complete`, {
      headers: { Cookie: `oa_onboarding=${cookie(oauth, 'oa_onboarding')}` },
      data: { username, displayName: username, password: 'lifecycle-room-pass', confirmPassword: 'lifecycle-room-pass' },
    })
    expect(account.ok()).toBe(true)
    await page.context().addCookies([{ name: 'oa_session', value: cookie(account, 'oa_session'), url: FRONTEND_URL }])
    await page.addInitScript(() => {
      localStorage.setItem('open-agricola-locale-v2', 'en')
      window.lifecycleMessages = []
      const NativeWebSocket = window.WebSocket
      window.WebSocket = class extends NativeWebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols)
          window.lifecycleSocket = this
          this.addEventListener('message', event => {
            const message: ServerEvent = JSON.parse(event.data)
            window.lifecycleMessages.push(message)
            if (message.type === 'stateUpdate') window.lifecycleUpdate = message
          })
        }
      }
    })
    await page.goto(`${FRONTEND_URL}/?player=p${index + 1}&transport=ws&room=dev2&devMode=1`)
    await expect(page.locator('.game-layout')).toBeVisible({ timeout: 30000 })
    await expect.poll(() => page.evaluate(() => window.lifecycleUpdate?.payload.state.players.length)).toBe(2)
  }
}

export const roomSnapshot = (page: Page): Promise<GameSyncPayload> => page.evaluate(() => {
  if (!window.lifecycleUpdate) throw new Error('Room has not synchronized')
  return window.lifecycleUpdate.payload
})

export function roomDriver(pages: [Page, Page]) {
  const waitForVersion = async (version: number) => {
    for (const page of pages) await expect.poll(() => page.evaluate(() =>
      window.lifecycleUpdate?.version ?? -1,
    )).toBeGreaterThanOrEqual(version)
  }
  const command = async (playerIndex: number, body: ClientCommand) => {
    const actor = pages[playerIndex]!
    const requestId = crypto.randomUUID()
    await actor.evaluate(async ({ body, requestId }) => {
      const scopeRequest = `${requestId}-scope`
      const scope = await new Promise<Extract<ServerEvent, { type: 'commandScope' }>>((resolve, reject) => {
        const receive = (event: MessageEvent) => {
          const message: ServerEvent = JSON.parse(event.data)
          if (!('requestId' in message) || message.requestId !== scopeRequest) return
          clearTimeout(timer)
          window.lifecycleSocket.removeEventListener('message', receive)
          if (message.type === 'commandScope') resolve(message)
          else reject(new Error(JSON.stringify(message)))
        }
        const timer = setTimeout(() => {
          window.lifecycleSocket.removeEventListener('message', receive)
          reject(new Error('Room command scope timed out'))
        }, 5000)
        window.lifecycleSocket.addEventListener('message', receive)
        window.lifecycleSocket.send(JSON.stringify({ type: 'getCommandScope', requestId: scopeRequest }))
      })
      const update = window.lifecycleUpdate
      if (!update) throw new Error('Room has not synchronized')
      window.lifecycleSocket.send(JSON.stringify({ ...body, requestId, commandContext: {
        scopeId: scope.scope.scopeId, commandId: crypto.randomUUID(), roomId: update.roomId,
        expectedVersion: update.version, inputWindowId: update.inputWindow?.id,
      } }))
    }, { body, requestId })
    const receipt = () => actor.evaluate(id => window.lifecycleMessages.find(message =>
      'requestId' in message && message.requestId === id &&
      (message.type === 'commandReceipt' || message.type === 'error'),
    ), requestId)
    await expect.poll(receipt).toBeTruthy()
    const result = await receipt()
    if (result?.type !== 'commandReceipt' || result.status !== 'completed') throw new Error(JSON.stringify(result))
    expect(result.receipt.outcome.ok, result.receipt.outcome.error).toBe(true)
    await waitForVersion(result.receipt.outcome.roomVersion!)
  }
  const ui = async (playerIndex: number, action: () => Promise<unknown>) => {
    const actor = pages[playerIndex]!
    const before = await actor.evaluate(() => window.lifecycleMessages.length)
    await action()
    const receipt = () => actor.evaluate(start => window.lifecycleMessages.slice(start).find(message =>
      message.type === 'commandReceipt' && message.status === 'completed',
    ), before)
    await expect.poll(receipt).toBeTruthy()
    const result = await receipt()
    if (result?.type !== 'commandReceipt' || result.status !== 'completed') throw new Error(JSON.stringify(result))
    expect(result.receipt.outcome.ok, result.receipt.outcome.error).toBe(true)
    await waitForVersion(result.receipt.outcome.roomVersion!)
  }
  const reload = async () => {
    for (const page of pages) {
      await page.reload()
      await expect(page.locator('.game-layout')).toBeVisible({ timeout: 30000 })
      await expect.poll(() => page.evaluate(() => !!window.lifecycleUpdate)).toBe(true)
    }
  }
  return { command, ui, reload }
}

export const publicRoomState = ({ state, scores }: GameSyncPayload) => ({
  round: state.round,
  roundPhase: state.roundPhase,
  players: state.players.map(player => ({
    id: player.id, resources: player.resources, stableTiles: player.stableTiles,
    fields: player.fields, pastures: player.pastures, houseAnimals: player.houseAnimals,
    farmyardSpaceStates: player.farmyardSpaceStates, improvements: player.improvements,
  })),
  events: state.events,
  log: state.log,
  scores,
})
