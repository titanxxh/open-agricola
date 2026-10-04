import { expect, test, type APIResponse, type Page } from '@playwright/test'
import { BACKEND_URL, FRONTEND_URL } from './fixtures'
import type { GameSyncPayload } from '../shared/contract/protocol/game'
import type { ServerEvent } from '../shared/contract/protocol/ws'

const cookie = (response: APIResponse, name: string) => response.headersArray()
  .find(header => header.name.toLowerCase() === 'set-cookie' && header.value.startsWith(`${name}=`))!
  .value.split(';')[0]!.slice(name.length + 1)
type AuditWindow = Window & { auditSocket: WebSocket; auditState: GameSyncPayload; auditMessages: ServerEvent[] }
const snapshot = (page: Page) => page.evaluate(() => (window as AuditWindow).auditState)
let sequence = 0
const command = async (page: Page, body: Record<string, unknown>) => {
  const requestId = `history-e2e-${++sequence}`
  await page.evaluate(({ body, requestId }) => (window as AuditWindow).auditSocket.send(JSON.stringify({ ...body, requestId })), { body, requestId })
  await expect.poll(() => page.evaluate(id => (window as AuditWindow).auditMessages.some(message => 'requestId' in message && message.requestId === id), requestId)).toBe(true)
  const result = await page.evaluate(id => (window as AuditWindow).auditMessages.find(message => 'requestId' in message && message.requestId === id), requestId)
  expect(result?.type, JSON.stringify(result)).toBe('stateUpdate')
  if (result?.type === 'stateUpdate') expect(result.payload.ok, result.payload.error).toBe(true)
}

test('real Room history loads earlier groups, preserves cancellation markers and refreshes names after reconnect', async ({ browser, request }) => {
  const suffix = Date.now().toString(36)
  const pages: Page[] = []
  const tokens: string[] = []
  for (let index = 0; index < 2; index++) {
    const page = await browser.newPage()
    const username = `history_${suffix}_${index}`
    const oauth = await request.post(`${BACKEND_URL}/api/test/oauth/github/callback`, { data: {
      providerUserId: username, providerLogin: username, email: `${username}@example.com`, displayName: `History${index}`,
    } })
    expect(oauth.ok()).toBe(true)
    const complete = await request.post(`${BACKEND_URL}/api/auth/onboarding/complete`, {
      headers: { Cookie: `oa_onboarding=${cookie(oauth, 'oa_onboarding')}` },
      data: { username, displayName: `History${index}`, password: 'history-pass-954', confirmPassword: 'history-pass-954' },
    })
    expect(complete.ok(), await complete.text()).toBe(true)
    tokens.push(cookie(complete, 'oa_session'))
    await page.context().addCookies([{ name: 'oa_session', value: tokens[index]!, url: FRONTEND_URL }])
    await page.addInitScript(() => {
      localStorage.setItem('open-agricola-locale-v2', 'en')
      ;(window as AuditWindow).auditMessages = []
      const NativeWebSocket = window.WebSocket
      window.WebSocket = class extends NativeWebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols)
          ;(window as AuditWindow).auditSocket = this
          this.addEventListener('message', event => {
            const message = JSON.parse(event.data as string) as ServerEvent
            ;(window as AuditWindow).auditMessages.push(message)
            if (message.type === 'stateUpdate') (window as AuditWindow).auditState = message.payload
          })
        }
      }
    })
    pages.push(page)
  }
  const [p1, p2] = pages as [Page, Page]
  await p1.goto('/?player=p1&transport=ws&maxPlayers=2')
  await expect(p1.locator('.ws-invite-roomid strong')).toBeVisible({ timeout: 30000 })
  const room = await p1.locator('.ws-invite-roomid strong').textContent()
  await p2.goto(`/?player=p2&transport=ws&room=${room}`)
  for (const page of pages) await expect(page.locator('.game-layout')).toBeVisible({ timeout: 30000 })
  for (let index = 0; index < 28; index++) {
    let current = await snapshot(p1)
    while (current.interaction.stateId === 'wait') {
      if (current.interaction.request.kind === 'private-prompt') {
        const actor = current.interaction.playerIndex
        await command(pages[actor]!, { type: 'getState' })
        current = await snapshot(pages[actor]!)
        if (current.interaction.stateId !== 'wait') throw new Error('Missing actor prompt')
      }
      const pending = current.interaction.request
      if (pending.kind !== 'confirm-next-player' && pending.kind !== 'confirm-player-switch') throw new Error(pending.kind)
      const actor = pending.kind === 'confirm-next-player' ? pending.nextPlayerIndex : pending.fromPlayerIndex
      await command(pages[actor]!, { type: 'choice', value: 'confirm' })
      current = await snapshot(p1)
    }
    const actor = current.state.currentPlayerIndex
    const actorState = await snapshot(pages[actor]!)
    const spaceId = ['forest', 'reed-bank', 'fishing', 'day-laborer'].find(id => actorState.actionAvailability?.[id])
    expect(spaceId).toBeTruthy()
    await command(pages[actor]!, { type: 'action', spaceId })
  }
  const live = await snapshot(p1)
  expect(live.historyWindow!.operationGroupIds).toHaveLength(20)
  expect(live.historyWindow!.nextCursor).toBeTruthy()
  const rows = p1.locator('[data-testid^="action-log-row-"]')
  const liveRows = await rows.count()
  await p1.getByRole('button', { name: 'Load earlier entries', exact: true }).click()
  await expect(p1.getByRole('button', { name: 'Load earlier entries', exact: true })).toHaveCount(0)
  expect(await rows.count()).toBeGreaterThan(liveRows)
  await command(p2, { type: 'undoAction' })
  await expect(p1.getByRole('button', { name: 'Load earlier entries', exact: true })).toBeVisible()
  await expect(p1.getByRole('status').filter({ hasText: 'History updated' })).toBeVisible()
  await expect(p1.locator('.action-log__text--canceled')).not.toHaveCount(0)
  await p1.getByRole('button', { name: 'Load earlier entries', exact: true }).click()
  await expect(p1.getByRole('button', { name: 'Load earlier entries', exact: true })).toHaveCount(0)
  const allRows = await rows.count()
  const renamed = await request.patch(`${BACKEND_URL}/api/auth/profile`, { headers: { Cookie: `oa_session=${tokens[0]}` }, data: { displayName: 'HistoryRenamed' } })
  expect(renamed.ok()).toBe(true)
  await p1.reload()
  await expect(p1.locator('.game-layout')).toBeVisible({ timeout: 30000 })
  await expect(p1.getByRole('button', { name: 'Load earlier entries', exact: true })).toBeVisible()
  await p1.getByRole('button', { name: 'Load earlier entries', exact: true }).click()
  await expect(p1.getByRole('button', { name: 'Load earlier entries', exact: true })).toHaveCount(0)
  await expect(rows).toHaveCount(allRows)
  await expect(p1.locator('.action-log__text').filter({ hasText: 'HistoryRenamed' }).first()).toBeVisible()
  await expect(p1.locator('.action-log__text--canceled')).not.toHaveCount(0)
  for (const page of pages) await page.close()
})
