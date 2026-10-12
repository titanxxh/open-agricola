import { expect, test, type Page, type APIResponse } from '@playwright/test'
import { BACKEND_URL, FRONTEND_URL } from './fixtures'
import type { GameSyncPayload } from '../shared/contract/protocol/game'
import type { ServerEvent } from '../shared/contract/protocol/ws'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'

type AuditWindow = Window & typeof globalThis & {
  auditSocket: WebSocket
  auditState: GameSyncPayload
  auditMessages: ServerEvent[]
  auditAnimations: string[]
}
const cookie = (response: APIResponse, name: string) => response.headersArray()
  .find(header => header.name.toLowerCase() === 'set-cookie' && header.value.startsWith(`${name}=`))!
  .value.split(';')[0]!.slice(name.length + 1)
const snapshot = (page: Page) => page.evaluate(() => (window as AuditWindow).auditState)
let sequence = 0
const command = async (actor: Page, observer: Page, body: Record<string, unknown>) => {
  const requestId = `projection-${++sequence}`
  await actor.evaluate(async ({ body, requestId }) => {
    const audit = window as AuditWindow
    const scopeId = `${requestId}-scope`
    const scope = await new Promise<Extract<ServerEvent, { type: 'commandScope' }>>((resolve, reject) => {
      const timeout = setTimeout(() => { audit.auditSocket.removeEventListener('message', receive); reject(new Error('Scope timeout')) }, 5000)
      const receive = (event: MessageEvent) => {
        const message = JSON.parse(event.data) as ServerEvent
        if (!('requestId' in message) || message.requestId !== scopeId) return
        clearTimeout(timeout); audit.auditSocket.removeEventListener('message', receive)
        if (message.type === 'commandScope') resolve(message)
        else reject(new Error(JSON.stringify(message)))
      }
      audit.auditSocket.addEventListener('message', receive)
      audit.auditSocket.send(JSON.stringify({ type: 'getCommandScope', requestId: scopeId }))
    })
    const state = audit.auditMessages.findLast(message => message.type === 'stateUpdate')!
    audit.auditSocket.send(JSON.stringify({ ...body, requestId, commandContext: {
      scopeId: scope.scope.scopeId, commandId: crypto.randomUUID(), roomId: state.roomId,
      expectedVersion: state.version, inputWindowId: state.inputWindow?.id,
    } }))
  }, { body, requestId })
  const receipt = () => actor.evaluate(id => (window as AuditWindow).auditMessages.find(message =>
    'requestId' in message && message.requestId === id && (message.type === 'commandReceipt' || message.type === 'error')), requestId)
  await expect.poll(receipt).toBeTruthy()
  const result = await receipt()
  if (result?.type !== 'commandReceipt' || result.status !== 'completed') throw new Error(JSON.stringify(result))
  expect(result.receipt.outcome.ok, result.receipt.outcome.error).toBe(true)
  for (const page of [actor, observer]) await expect.poll(() => page.evaluate(() =>
    (window as AuditWindow).auditMessages.findLast(message => message.type === 'stateUpdate')?.version ?? 0,
  )).toBeGreaterThanOrEqual(result.receipt.outcome.roomVersion!)
}

test('a legal card disclosure refreshes old Room pages without losing the reading anchor or replaying receipts', async ({ browser, request }) => {
  const pages: Page[] = []
  try {
    const suffix = Date.now().toString(36)
    for (let index = 0; index < 2; index++) {
      const page = await browser.newPage()
      pages.push(page)
      const username = `projection_${suffix}_${index}`
      const oauth = await request.post(`${BACKEND_URL}/api/test/oauth/github/callback`, { data: {
        providerUserId: username, providerLogin: username, email: `${username}@example.com`, displayName: `Projection${index}`,
      } })
      expect(oauth.ok()).toBe(true)
      const account = await request.post(`${BACKEND_URL}/api/auth/onboarding/complete`, {
        headers: { Cookie: `oa_onboarding=${cookie(oauth, 'oa_onboarding')}` },
        data: { username, displayName: `Projection${index}`, password: 'projection-pass-1109', confirmPassword: 'projection-pass-1109' },
      })
      expect(account.ok()).toBe(true)
      await page.context().addCookies([{ name: 'oa_session', value: cookie(account, 'oa_session'), url: FRONTEND_URL }])
      await page.addInitScript(() => {
        localStorage.setItem('open-agricola-locale-v2', 'en')
        const audit = window as AuditWindow
        audit.auditMessages = []; audit.auditAnimations = []
        const NativeWebSocket = window.WebSocket
        window.WebSocket = class extends NativeWebSocket {
          constructor(url: string | URL, protocols?: string | string[]) {
            super(url, protocols); audit.auditSocket = this
            this.addEventListener('message', event => {
              const message = JSON.parse(event.data as string) as ServerEvent
              audit.auditMessages.push(message)
              if (message.type === 'stateUpdate') audit.auditState = message.payload
            })
          }
        }
        document.addEventListener('DOMContentLoaded', () => {
          new MutationObserver(records => {
            for (const record of records) for (const node of record.addedNodes) {
              if (!(node instanceof Element)) continue
              const animations = [...node.querySelectorAll('[data-testid^="public-event-resource-animation-"]')]
              if (node.matches('[data-testid^="public-event-resource-animation-"]')) animations.push(node)
              animations.forEach(element => audit.auditAnimations.push(element.getAttribute('data-testid')!))
            }
          }).observe(document.body, { childList: true, subtree: true })
        })
      })
    }
    const [p1, p2] = pages as [Page, Page]
    for (let index = 0; index < 2; index++) {
      await pages[index]!.goto(`/?player=p${index + 1}&transport=ws&room=dev2&devMode=1`)
      await expect(pages[index]!.locator('.game-layout')).toBeVisible({ timeout: 30000 })
    }
    // Fixture staging uses the dev Room's authoritative load command; all later
    // actions, handoffs, animal choices and card purchases follow the real WS path.
    const fixture = createWorkSession({ seed: 10, configure: state => {
      state.players[1]!.minorHand = ['D036_BreedRegistry']
      state.players.forEach(player => { player.resources.food = 100 })
    } })
    try {
      await command(p1, p2, { type: 'loadGame', state: fixture.withCtx(() => serializeState(fixture.state, {})) })
    } finally { fixture.dispose() }
    const send = (actor: number, body: Record<string, unknown>) => command(pages[actor]!, pages[1 - actor]!, body)
    const settle = async () => {
      for (let step = 0; step < 16; step++) {
        let current = await snapshot(p1)
        if (current.interaction.stateId !== 'wait') return current
        const actor = current.interaction.playerIndex
        current = await snapshot(pages[actor]!)
        if (current.interaction.stateId !== 'wait') throw new Error('Missing actor interaction')
        const kind = current.interaction.request.kind
        if (kind === 'animal-reorg') await send(actor, { type: 'choice', value: 'confirm', payload: { zones: [] } })
        else if (kind === 'confirm-next-player' || kind === 'confirm-player-switch') await send(actor, { type: 'choice', value: 'confirm' })
        else throw new Error(`Unexpected pending ${kind}`)
      }
      throw new Error('Did not reach work')
    }
    const collect = async () => {
      const current = await settle()
      const actor = current.state.currentPlayerIndex
      const available = (await snapshot(pages[actor]!)).actionAvailability!
      const spaceId = ['forest', 'reed-bank', 'fishing', 'day-laborer'].find(id => available[id])!
      await send(actor, { type: 'action', spaceId })
    }
    await send(0, { type: 'action', spaceId: 'forest' }); await settle()
    await send(1, { type: 'action', spaceId: 'sheep-market' }); await settle()
    const early = (await snapshot(p2)).state.events.find(event => event.type === 'card.triggered' && event.cardId === 'D036_BreedRegistry')!
    expect(early.occurrenceId).toBeTruthy()
    expect(JSON.stringify(await snapshot(p1))).not.toContain(early.occurrenceId!)
    await send(0, { type: 'action', spaceId: 'fishing' })
    for (let index = 0; index < 25; index++) await collect()
    await p1.getByRole('button', { name: 'Load earlier entries', exact: true }).click()
    await expect(p1.getByTestId('room-history-controls').getByRole('button')).toHaveCount(0)
    expect(await p1.evaluate(() => JSON.stringify((window as AuditWindow).auditMessages))).not.toContain(early.occurrenceId!)
    if ((await settle()).state.currentPlayerIndex === 0) { await collect(); await settle() }
    const before = await snapshot(p1)
    expect(before.state.currentPlayerIndex).toBe(1)
    const body = p1.locator('.action-log__body')
    const reading = await body.evaluate(element => {
      element.scrollTop = element.scrollHeight - element.clientHeight
      const top = element.getBoundingClientRect().top
      const row = [...element.querySelectorAll('[data-testid^="action-log-row-event:"]')].find(row => {
        const bounds = row.getBoundingClientRect()
        return bounds.top >= top && bounds.bottom <= top + element.clientHeight
      })!
      return { id: row.getAttribute('data-testid')!, offsetY: row.getBoundingClientRect().top - top }
    })
    await expect(p1.locator('.public-event-resource-animation')).toHaveCount(0)
    const oldOccurrences = await p1.evaluate(() => (window as AuditWindow).auditMessages.flatMap(message =>
      message.type === 'stateUpdate' ? message.payload.state.events.map(event => event.occurrenceId).filter((id): id is string => !!id) : [],
    ))
    const pagesBefore = await p1.evaluate(() => (window as AuditWindow).auditMessages.filter(message => message.type === 'historyPage').length)
    await p1.evaluate(() => { (window as AuditWindow).auditAnimations = [] })
    await send(1, { type: 'action', spaceId: 'meeting-place' })
    const pending = await snapshot(p2)
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'choice') throw new Error('Expected optional improvement')
    await send(1, { type: 'choice', value: pending.interaction.request.options.find(option => option.value !== '__skip__')!.value })
    expect((await snapshot(p1)).historyWindow!.branchId).toBe(before.historyWindow!.branchId)
    await expect(p1.getByTestId(`action-log-row-event:${early.occurrenceId}`)).toHaveCount(1)
    await expect(p1.getByTestId('room-history-controls').getByRole('button')).toHaveCount(0)
    expect(await p1.evaluate(() => (window as AuditWindow).auditMessages.filter(message => message.type === 'historyPage').length)).toBeGreaterThan(pagesBefore)
    await expect.poll(() => p1.getByTestId(reading.id).evaluate((row, offset) => {
      const viewport = row.closest('.action-log__body')!
      return Math.abs(row.getBoundingClientRect().top - viewport.getBoundingClientRect().top - offset)
    }, reading.offsetY)).toBeLessThanOrEqual(2)
    const animations = await p1.evaluate(() => (window as AuditWindow).auditAnimations)
    expect(animations.filter(id => oldOccurrences.some(occurrence => id.includes(occurrence)))).toEqual([])
    await expect(p1.getByRole('status').filter({ hasText: 'History updated' })).toHaveCount(0)
  } finally { for (const page of pages) await page.close() }
})
