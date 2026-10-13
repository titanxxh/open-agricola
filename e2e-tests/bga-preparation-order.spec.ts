import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import type { SessionResponse } from '../server/game/authoritative-session'
import { serializeState } from '../shared/session/serialization'
import { BACKEND_URL } from './fixtures'

const ARTISAN = 'A096_TaskArtisan'
const COB = 'A076_Cob'

// Stage only a fresh two-player round-six work game. All placements, harvest
// confirmations, reveal reactions and WorkStart purchases follow browser controls.
// The existing HTTP sandbox intentionally lets one human control both seats.
const openScenario = async (page: Page, request: APIRequestContext) => {
  const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, {
    data: { seed: 4242, playerCount: 2, customCardIds: [] },
  })
  expect(fresh.ok(), await fresh.text()).toBe(true)
  const fixture = createWorkSession({ seed: 4242, configure: state => {
    state.round = 6
    const quarryIndex = state.roundActionOrder.indexOf('western-quarry')
    expect(quarryIndex).toBeGreaterThanOrEqual(0)
    ;[state.roundActionOrder[6], state.roundActionOrder[quarryIndex]] = [
      state.roundActionOrder[quarryIndex]!, state.roundActionOrder[6]!,
    ]
    for (const player of state.players) {
      Object.assign(player.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
    }
    state.players[0]!.occupationPlayed = [ARTISAN]
    state.players[0]!.minorHand = [COB]
    state.players[0]!.resources.clay = 1
    state.actionSpaces.find(space => space.id === 'western-quarry')!.resources.stone = 0
  } })
  try {
    const loaded = await request.post(`${BACKEND_URL}/api/game/load`, {
      data: { state: fixture.withCtx(() => serializeState(fixture.state, {})) },
    })
    expect(loaded.ok(), await loaded.text()).toBe(true)
  } finally { fixture.dispose() }
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  await expect(page.locator('.game-layout')).toBeVisible()
  await expect(page.locator('.header-round')).toHaveText('R6/14')
  await expect(page.locator('.header-phase-pill.active')).toHaveText('Work')
}

const snapshot = async (request: APIRequestContext): Promise<SessionResponse> => {
  const response = await request.get(`${BACKEND_URL}/api/game/state`)
  expect(response.ok(), await response.text()).toBe(true)
  return response.json()
}

const clickCommand = async (page: Page, control: Locator, endpoint: string): Promise<SessionResponse> => {
  await expect(control).toBeVisible()
  await expect(control).toBeEnabled()
  const response = page.waitForResponse(response => response.url().endsWith(`/api/game/${endpoint}`))
  await control.click()
  const result: SessionResponse = await (await response).json()
  expect(result.ok, result.error).toBe(true)
  return result
}

const clickChoice = (page: Page, value: string) => clickCommand(page,
  page.locator(`.interaction-bar [data-choice-value=${JSON.stringify(value)}]`), 'choice')

const settleTurnOrHarvest = async (page: Page, request: APIRequestContext): Promise<SessionResponse> => {
  for (let step = 0; step < 12; step++) {
    const current = await snapshot(request)
    if (current.interaction.stateId !== 'wait') return current
    const kind = current.interaction.request.kind
    if (kind === 'confirm-next-player') {
      await clickCommand(page, page.locator('.interaction-bar').getByRole('button', { name: 'Confirm switch', exact: true }), 'next-player')
    } else if (kind === 'confirm-player-switch') {
      await clickCommand(page, page.locator('.interaction-bar').getByRole('button', { name: 'Confirm switch', exact: true }), 'confirm-player-switch')
    } else if (kind === 'feed') {
      await clickCommand(page, page.locator('.exchange-overlay .exchange-confirm'), 'feed')
    } else return current
  }
  throw new Error('Turn or harvest confirmations did not finish')
}

const reachReveal = async (page: Page, request: APIRequestContext) => {
  for (const [actor, spaceId] of [[0, 'grain-seeds'], [1, 'reed-bank'], [0, 'day-laborer'], [1, 'clay-pit']] satisfies [number, string][]) {
    const current = await settleTurnOrHarvest(page, request)
    expect(current.state.round).toBe(6)
    expect(current.interaction.stateId).toBe('idle')
    expect(current.state.currentPlayerIndex).toBe(actor)
    await clickCommand(page, page.locator(`[data-action-id="${spaceId}"] button`).first(), 'action')
  }
  const revealed = await settleTurnOrHarvest(page, request)
  expect(revealed.state.round).toBe(7)
  expect(revealed.state.roundPhase).toBe('preparation')
  expect(revealed.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
  expect(revealed.state.events.filter(event => event.type === 'action.revealed'
    && event.actionId === 'western-quarry' && event.roundSlot === 7)).toHaveLength(1)
  expect(revealed.state.actionSpaces.find(space => space.id === 'western-quarry')!.resources.stone).toBe(0)
  await expect(page.locator('.header-round')).toHaveText('R7/14')
  await expect(page.locator('.header-phase-pill.active')).toHaveText('Preparation')
  await expect(page.locator('[data-action-id="day-laborer"] button').first()).toBeDisabled()
  return revealed
}

const artisanGains = (response: SessionResponse) => response.state.events.filter(event =>
  event.type === 'resource.moved' && event.sourceCardId === ARTISAN && event.resources.wood === 1)

const expectVisibleResources = async (page: Page, response: SessionResponse) => {
  const owner = response.state.players[response.state.currentPlayerIndex]!
  const resources = page.locator(`[data-player-resource-anchor="${owner.id}"]`)
  for (const [name, key] of [['Wood', 'wood'], ['Clay', 'clay'], ['Grain', 'grain'], ['Food', 'food']] as const) {
    await expect(resources.locator(`[aria-label="${name}: ${owner.resources[key]}"]`)).toBeVisible()
  }
}

const reachArtisanImprovement = async (page: Page, request: APIRequestContext, accept: boolean) => {
  for (let step = 0; step < 6; step++) {
    const current = await snapshot(request)
    if (accept && current.state.players[0]!.minorPlayed.includes(COB)) return current
    expect(current.interaction.stateId).toBe('wait')
    if (current.interaction.stateId !== 'wait') throw new Error('Expected reveal reaction')
    if (!('options' in current.interaction.request)) throw new Error('Expected reveal choices')
    const options = current.interaction.request.options ?? []
    const card = options.find(option => option.value === COB)
    if (card) return accept ? clickChoice(page, COB) : clickChoice(page, '__skip__')
    const trigger = options.find(option => option.value === ARTISAN)
    const entry = options.find(option => option.value.startsWith('action-improvement-'))
    const skip = options.find(option => option.value === '__skip__')
    if (!accept && skip) return clickChoice(page, skip.value)
    const choice = trigger ?? entry ?? options.find(option => !('disabled' in option && option.disabled === true) && option.value !== '__skip__' && option.value !== '__pass__')
    expect(choice, JSON.stringify(current.interaction)).toBeDefined()
    await clickChoice(page, choice!.value)
  }
  throw new Error('Task Artisan did not reach its minor-improvement action')
}

for (const accept of [false, true]) {
  test(`Quarry reveal rewards once and ${accept ? 'new Cob acts at WorkStart' : 'declining reaches ordinary work'}`, async ({ page, request }, testInfo) => {
    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))
    await openScenario(page, request)
    const revealed = await reachReveal(page, request)
    expect(revealed.state.players[0]!.resources.wood).toBe(0)
    expect(artisanGains(revealed)).toHaveLength(0)
    if (revealed.interaction.stateId !== 'wait') throw new Error('Expected reveal source selection')
    expect(revealed.interaction.request.kind).toBe('select-trigger')
    expect(revealed.interaction.request.options?.find(option => option.value === '__pass__')?.disabled).toBe(true)
    await expect(page.locator('.interaction-bar [data-choice-value="__pass__"]')).toBeDisabled()
    await expectVisibleResources(page, revealed)
    // Refresh the real pending window; no state or cursor is replaced here.
    await page.reload()
    await expect(page.locator('.header-phase-pill.active')).toHaveText('Preparation')
    await expect(page.locator('.interaction-bar')).toContainText('Task Artisan')
    const activated = await clickChoice(page, ARTISAN)
    expect(activated.state.players[0]!.resources.wood).toBe(1)
    expect(artisanGains(activated)).toHaveLength(0)
    expect(activated.state.actionSpaces.find(space => space.id === 'western-quarry')!.resources.stone).toBe(0)
    await expectVisibleResources(page, activated)
    await page.reload()
    await expect(page.locator('.interaction-bar')).toContainText('Task Artisan')
    expect((await snapshot(request)).state.players[0]!.resources.wood).toBe(1)
    const purchased = await reachArtisanImprovement(page, request, accept)
    expect(purchased.state.players[0]!.resources.wood).toBe(1)
    // The enclosing reveal window commits its gain when the remaining exchange is passed.
    expect(artisanGains(purchased)).toHaveLength(0)
    expect(purchased.state.roundPhase).toBe('preparation')
    expect(purchased.state.actionSpaces.find(space => space.id === 'western-quarry')!.resources.stone).toBe(0)
    if (purchased.interaction.stateId !== 'wait') throw new Error('Expected remaining reveal exchange')
    expect(purchased.interaction.request.kind).toBe('select-trigger')
    expect(purchased.interaction.request.options?.some(option => option.value === ARTISAN)).toBe(false)
    expect(purchased.interaction.request.options?.find(option => option.value === '__pass__')?.disabled).not.toBe(true)
    const completed = await clickChoice(page, '__pass__')
    expect(completed.state.players[0]!.resources.wood).toBe(1)
    expect(artisanGains(completed)).toHaveLength(1)
    expect(completed.state.actionSpaces.find(space => space.id === 'western-quarry')!.resources.stone).toBe(1)
    if (accept) {
      expect(completed.state.players[0]!.minorPlayed).toContain(COB)
      expect(completed.state.players[0]!.resources).toMatchObject({ clay: 1, grain: 1, food: 41 })
      expect(completed.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: COB })
      await expect(page.locator('.interaction-bar')).toContainText('Cob')
      for (let step = 0; step < 4; step++) {
        const current = await snapshot(request)
        if (current.state.roundPhase === 'work' && current.interaction.stateId === 'idle') break
        if (current.interaction.stateId !== 'wait') throw new Error('Expected Cob WorkStart exchange')
        if (!('options' in current.interaction.request)) throw new Error('Expected Cob exchange choices')
        const choice = current.interaction.request.options?.find(option => !('disabled' in option && option.disabled === true) && option.value !== '__skip__')
        expect(choice, JSON.stringify(current.interaction)).toBeDefined()
        await clickChoice(page, choice!.value)
      }
    } else {
      expect(completed.state.players[0]!.minorHand).toContain(COB)
      expect(completed.state.players[0]!.minorPlayed).not.toContain(COB)
    }
    const work = await settleTurnOrHarvest(page, request)
    expect(work.state.round).toBe(7)
    expect(work.state.roundPhase).toBe('work')
    expect(work.interaction.stateId).toBe('idle')
    expect(work.state.players[0]!.resources).toMatchObject(accept
      ? { wood: 1, clay: 3, grain: 0, food: 42 }
      : { wood: 1, clay: 1, grain: 1, food: 42 })
    expect(artisanGains(work)).toHaveLength(1)
    expect(work.state.events.filter(event => event.type === 'card.played' && event.cardId === COB)).toHaveLength(accept ? 1 : 0)
    expect(work.state.actionSpaces.find(space => space.id === 'western-quarry')!.resources.stone).toBe(1)
    await expect(page.locator('.header-phase-pill.active')).toHaveText('Work')
    await expect(page.locator('[data-action-id="day-laborer"] button').first()).toBeEnabled()
    await expectVisibleResources(page, work)
    expect(pageErrors).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(accept ? 'quarry-cob-work-start.png' : 'quarry-decline-work.png') })
  })
}
