import { expect, type APIRequestContext, type APIResponse, type BrowserContext, type Page, type TestInfo } from '@playwright/test'
import type { ClientCommand, ServerEvent } from '../../shared/contract/protocol/ws'
import type { GameSyncPayload, StateUpdateEnvelope } from '../../shared/contract/protocol/game'
import { BACKEND_URL, FRONTEND_URL } from '../fixtures'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function recordSoloEvidence(testInfo: TestInfo, name: string, value: unknown) {
  const path = testInfo.outputPath(`${name}.json`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(value, null, 2))
  await testInfo.attach(name, { path, contentType: 'application/json' })
}

const cookieValue = (response: APIResponse, name: string) => {
  const cookie = response.headersArray().find(header => header.name.toLowerCase() === 'set-cookie' && header.value.startsWith(`${name}=`))
  if (!cookie) throw new Error(`Missing ${name} cookie`)
  return cookie.value.split(';')[0]!.slice(name.length + 1)
}

export async function authenticateSolo(context: BrowserContext, request: APIRequestContext, username: string) {
  const oauth = await request.post(`${BACKEND_URL}/api/test/oauth/github/callback`, { data: {
    providerUserId: `solo-acceptance-${username}`, providerLogin: username, email: `${username}@example.com`, displayName: username,
  } })
  expect(oauth.ok()).toBe(true)
  const complete = await request.post(`${BACKEND_URL}/api/auth/onboarding/complete`, {
    headers: { Cookie: `oa_onboarding=${cookieValue(oauth, 'oa_onboarding')}` },
    data: { username, displayName: username, password: 'solo-acceptance-pass-550', confirmPassword: 'solo-acceptance-pass-550' },
  })
  expect(complete.ok(), await complete.text()).toBe(true)
  await context.addCookies([{ name: 'oa_session', value: cookieValue(complete, 'oa_session'), url: FRONTEND_URL }])
  await context.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
}

export class SoloBrowserDriver {
  readonly page: Page
  readonly events: ServerEvent[] = []
  readonly commands: ClientCommand[] = []
  readonly trace: unknown[] = []
  constructor(page: Page) {
    this.page = page
    page.on('websocket', socket => {
      socket.on('framereceived', ({ payload }) => {
        if (typeof payload === 'string') this.events.push(JSON.parse(payload) as ServerEvent)
      })
      socket.on('framesent', ({ payload }) => {
        if (typeof payload === 'string') this.commands.push(JSON.parse(payload) as ClientCommand)
      })
    })
  }
  get envelope(): StateUpdateEnvelope {
    const value = this.events.findLast((event): event is StateUpdateEnvelope => event.type === 'stateUpdate')
    if (!value) throw new Error('No authoritative browser snapshot received')
    return value
  }
  get payload(): GameSyncPayload { return this.envelope.payload }
  get state() { return this.payload.state }
  get interaction() { return this.payload.interaction }
  get receipt() {
    const event = this.events.findLast((event): event is Extract<ServerEvent, { type: 'commandReceipt'; status: 'completed' }> => event.type === 'commandReceipt' && event.status === 'completed')
    if (!event) throw new Error('No completed command receipt')
    return event.receipt
  }
  async ui(label: string, click: () => Promise<unknown>) {
    const eventCount = this.events.length
    const commandCount = this.commands.length
    await click()
    await expect.poll(() => this.events.slice(eventCount).some(event => event.type === 'commandReceipt' && event.status === 'completed'), { message: label }).toBe(true)
    const receipt = this.receipt
    expect(receipt.outcome.ok, JSON.stringify({ label, receipt })).toBe(true)
    await expect.poll(() => this.envelope.version).toBeGreaterThanOrEqual(receipt.outcome.roomVersion ?? 0)
    this.trace.push({ label, commands: this.commands.slice(commandCount), receipt, envelope: this.envelope })
    return receipt
  }
  async choice(value: string) {
    return this.ui(`choice:${value}`, () => this.page.locator(`.interaction-bar [data-choice-value=${JSON.stringify(value)}]`).click())
  }
  async action(spaceId: string) {
    expect(this.interaction, JSON.stringify(this.interaction)).toMatchObject({ stateId: 'idle' })
    return this.ui(`action:${spaceId}`, () => spaceId.startsWith('season-')
      ? this.page.locator('.seasons-board [data-season="autumn"]').click()
      : this.page.locator(`[data-action-id="${spaceId}"] button`).first().click())
  }
  async confirm() {
    expect(this.interaction, JSON.stringify(this.interaction)).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player', nextPlayerIndex: 0 } })
    return this.ui('continue', () => this.page.getByRole('button', { name: 'Continue', exact: true }).click())
  }
  async open() {
    await this.page.goto(FRONTEND_URL)
    await this.page.getByRole('button', { name: 'Solo game', exact: true }).click()
    const setup = this.page.getByRole('dialog', { name: 'Start a solo game' })
    await setup.getByRole('radio', { name: /Choose 7 from 10/ }).check()
    for (const name of ['Enable Parent Cards expansion', 'Enable Through the Seasons expansion', 'Enable Farmers of the Moor expansion']) {
      await setup.getByRole('checkbox', { name }).check()
    }
    await setup.getByRole('button', { name: 'Start solo game', exact: true }).click()
    await expect(this.page).toHaveURL(/\?room=[^&]+$/)
    const overlay = this.page.getByRole('dialog', { name: 'Choose your starting hand' })
    await expect(overlay).toBeVisible()
    expect(this.state.soloHandSelection!.groups.map(group => [group.kind, group.cardIds.length, group.keepCount]))
      .toEqual([['occupation', 10, 7], ['minor', 4, 3], ['moor-minor', 6, 4]])
    for (const [index, group] of this.state.soloHandSelection!.groups.entries()) {
      const selected = group.cardIds.map((id, cardIndex) => ({ id, cardIndex })).filter(card => card.id !== 'E096_Elder').slice(0, group.keepCount)
      for (const card of selected) await overlay.locator('fieldset').nth(index).getByRole('checkbox').nth(card.cardIndex).check()
    }
    await this.ui('confirm-hand', () => overlay.getByRole('button', { name: 'Confirm starting hand' }).click())
    const parents = this.page.locator('.parent-selection-overlay')
    await expect(parents).toBeVisible()
    const candidates = this.state.parentSelection!.candidates.p1
    const preference = ['PR08', 'PR11', 'PR10', 'PR12', 'PR07', 'PR09', 'PR06', 'PR05', 'PR04', 'PR03', 'PR02', 'PR01'] as const
    const mother = preference.find(id => candidates.mother.includes(id))!
    const father = candidates.father[0]!
    await parents.locator(`[data-card-id="${mother}"]`).click()
    await parents.locator(`[data-card-id="${father}"]`).click()
    await this.ui('confirm-parents', () => parents.locator('.parent-selection-confirm').click())
    return { mother, father }
  }
  async attach(testInfo: TestInfo, name: string) {
    await recordSoloEvidence(testInfo, name, { trace: this.trace, commands: this.commands, latest: this.events.findLast(event => event.type === 'stateUpdate') })
  }
}
