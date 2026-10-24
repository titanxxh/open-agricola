import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'
import type { SessionResponse } from '../server/game/authoritative-session'
import { BACKEND_URL } from './fixtures'

async function prepare(page: Page, request: APIRequestContext, kind: 'sow' | 'animals') {
  expect((await request.post(`${BACKEND_URL}/api/game/new-sandbox`, {
    data: { seed: 1372, playerCount: 2, customCardIds: [] },
  })).ok()).toBe(true)
  const fixture = createWorkSession({ seed: 1372, configure: state => {
    state.round = 5
    for (const player of state.players) player.resources.food = 20
    const player = state.players[0]!
    if (kind === 'sow') {
      state.roundActionOrder = state.roundActionOrder.map(() => null)
      state.roundActionOrder[0] = 'grain-utilization'
      player.occupationPlayed = ['B113_PatchCaregiver', 'B115_TinsmithMaster']
      player.fields = [{ row: 0, col: 2, stacks: [] }]
      player.resources.grain = 2
      player.cardStates.B113_PatchCaregiver = { extraData: { cardFieldStacks: [null] } }
    } else {
      player.minorPlayed = ['C011_WildlifeReserve']
      Object.assign(player.resources, { sheep: 1, boar: 1, cattle: 1 })
      player.houseAnimals = { '2-0': 'cattle' }
      player.pastures = [{ id: 'nearby-pasture', tiles: [{ row: 0, col: 2 }], animalType: 'sheep', animalCount: 1 }]
      player.cardStates.C011_WildlifeReserve = { extraData: { animalCounts: { boar: 1 } } }
      state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep = 2
    }
  } })
  try {
    expect((await request.post(`${BACKEND_URL}/api/game/load`, {
      data: { state: fixture.withCtx(() => serializeState(fixture.state, { actionHooks: fixture.actionHooks })) },
    })).ok()).toBe(true)
  } finally { fixture.dispose() }
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  await expect(page.locator('.game-layout')).toBeVisible()
}

const tray = (page: Page) => page.getByRole('region', { name: 'Card targets' })
const farm = (page: Page) => page.locator('.game-layout__center .farm-grid')
const order = (page: Page) => page.locator('.game-layout__center [data-played-card-key]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-played-card-key')))
async function visibleTargets(page: Page) {
  await expect(tray(page)).toBeVisible()
  await expect.poll(() => page.locator('.farm-operation-area--with-card-targets').evaluate(node => {
    const bounds = node.getBoundingClientRect()
    const bar = document.querySelector('.interaction-bar')!.getBoundingClientRect()
    return bounds.top >= 0 && bounds.bottom <= bar.top
  })).toBe(true)
}
async function action(page: Page, id: string): Promise<SessionResponse> {
  const committed = page.waitForResponse(response => response.url().endsWith('/api/game/action'))
  await page.locator(`[data-action-id="${id}"] button`).first().click()
  const response: SessionResponse = await (await committed).json()
  expect(response.ok, response.error).toBe(true)
  return response
}
async function confirm(page: Page): Promise<SessionResponse> {
  const committed = page.waitForResponse(response => /\/api\/game\/(choice|commit-selection)$/.test(response.url()))
  const animalConfirm = page.locator('.interaction-reorg-panel').getByRole('button', { name: 'Confirm', exact: true })
  if (await animalConfirm.isVisible()) await animalConfirm.click()
  else await page.locator('.interaction-bar [data-choice-value="confirm"]').click()
  const response: SessionResponse = await (await committed).json()
  expect(response.ok, response.error).toBe(true)
  return response
}

for (const viewport of [{ width: 375, height: 812 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
  test(`mixed farm and Card Field targets share the draft above controls at ${viewport.width}x${viewport.height}`, async ({ page, request }) => {
    await page.setViewportSize(viewport)
    await prepare(page, request, 'sow')
    const beforeOrder = await order(page)
    await action(page, 'grain-utilization')
    await visibleTargets(page)
    await farm(page).locator('.sow-choice-button[title="Grain"]').click()
    await tray(page).locator('.sow-choice-button[title="Grain"]').click()
    const before: SessionResponse = await (await request.get(`${BACKEND_URL}/api/game/state`)).json()
    expect(before.state.players[0]!.resources.grain).toBe(2)
    expect(before.state.players[0]!.fields[0]!.stacks).toEqual([])
    const sown = await confirm(page)
    expect(sown.state.players[0]!.resources.grain).toBe(0)
    expect(sown.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    if (sown.interaction.stateId !== 'wait') throw new Error('Expected Tinsmith Master bonus')
    const accept = sown.interaction.request.options?.find(option => option.value !== '__skip__')
    if (!accept) throw new Error('Expected crop bonus activation')
    await page.locator(`.interaction-bar [data-choice-value="${accept.value}"]`).click()
    await visibleTargets(page)
    const slot = tray(page).locator('[data-card-field-position="-1-2113"]')
    await slot.click()
    await expect(slot).toHaveAttribute('aria-pressed', 'true')
    const bodySlot = page.locator('.played-card-slot [data-card-field-position="-1-2113"]')
    await expect(bodySlot).toHaveAttribute('aria-pressed', 'true')
    expect(await order(page)).toEqual(beforeOrder)
    await page.screenshot({ path: `output/playwright/farm-card-targets-sow-${viewport.width}.png` })
    const grown = await confirm(page)
    expect(grown.state.players[0]!.cardStates.B113_PatchCaregiver?.extraData?.cardFieldStacks).toEqual([{ crop: 'grain', remaining: 4 }])
    await expect(tray(page)).toHaveCount(0)
    expect((await request.post(`${BACKEND_URL}/api/game/undo-action`)).ok()).toBe(true)
    await page.reload()
    await expect(page.locator('.game-layout__center [data-played-card-key]')).toHaveCount(beforeOrder.length)
    await expect(tray(page)).toHaveCount(0)
    expect(await order(page)).toEqual(beforeOrder)
  })

  test(`farm and card animal controls share each zone at ${viewport.width}x${viewport.height}`, async ({ page, request }) => {
    await page.setViewportSize(viewport)
    await prepare(page, request, 'animals')
    const beforeOrder = await order(page)
    const collected = await action(page, 'sheep-market')
    expect(collected.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    await visibleTargets(page)
    const nearby = tray(page).locator('[data-card-animal-zone="card:C011_WildlifeReserve"]')
    const body = page.locator('.played-card-slot[data-played-card-key="minor:C011_WildlifeReserve"]')
    await nearby.getByRole('button', { name: 'Remove Sheep' }).click()
    await expect(body.getByRole('button', { name: 'Remove Sheep' })).toBeDisabled()
    await body.getByRole('button', { name: 'Add Sheep' }).click()
    await expect(nearby.getByRole('button', { name: 'Remove Sheep' })).toBeEnabled()
    await page.getByRole('button', { name: 'Return to current action' }).click()
    await visibleTargets(page)
    const before: SessionResponse = await (await request.get(`${BACKEND_URL}/api/game/state`)).json()
    expect(before.state.players[0]!.pastures[0]!.animalCount).toBe(1)
    expect(before.state.players[0]!.cardStates.C011_WildlifeReserve?.extraData?.animalCounts).toEqual({ boar: 1 })
    expect(await order(page)).toEqual(beforeOrder)
    await page.screenshot({ path: `output/playwright/farm-card-targets-animals-${viewport.width}.png` })
    const assigned = await confirm(page)
    expect(assigned.state.players[0]!.pastures[0]!.animalCount).toBe(2)
    expect(assigned.state.players[0]!.cardStates.C011_WildlifeReserve?.extraData?.animalCounts).toEqual({ sheep: 1, boar: 1 })
    expect(assigned.state.events.some(event => event.type === 'farm.animalDiscarded')).toBe(false)
    await expect(tray(page)).toHaveCount(0)
  })
}
