import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'
import type { GameState, SessionResponse } from '../shared/contract/types'
import { BACKEND_URL } from './fixtures'

async function prepare(page: Page, request: APIRequestContext, configure?: (state: GameState) => void, moor = false) {
  const options = { playerCount: 2, enableFarmersOfTheMoor: moor, allowIncompleteFarmersOfTheMoorMinorDeal: moor }
  expect((await request.post(`${BACKEND_URL}/api/game/new-sandbox`, { data: { ...options, seed: 1368, customCardIds: [] } })).ok()).toBe(true)
  const fixture = createWorkSession({ seed: 1368, options, configure: state => {
    state.round = 14
    Object.assign(state.players[0]!.resources, { wood: 20, reed: 10, food: 10, grain: 2, vegetable: 1 })
    configure?.(state)
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

const farm = (page: Page) => page.locator('[data-interaction-focus="farm"][data-focus-player="p1"]')
async function expectFarmVisible(page: Page) {
  await expect(farm(page)).toHaveAttribute('data-interaction-focused', 'true')
  await expect.poll(() => farm(page).evaluate(element => {
    const bounds = element.getBoundingClientRect()
    const bar = document.querySelector('.interaction-bar')!.getBoundingClientRect()
    return bounds.top >= 0 && bounds.bottom <= bar.top
  })).toBe(true)
}
async function action(page: Page, id: string): Promise<SessionResponse> {
  const sent = page.waitForResponse(response => response.url().endsWith('/api/game/action'))
  await page.locator(`[data-action-id="${id}"] button`).first().click()
  const response: SessionResponse = await (await sent).json()
  expect(response.ok, response.error).toBe(true)
  return response
}
async function choice(page: Page, value: string): Promise<SessionResponse> {
  const sent = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
  await page.locator(`.interaction-bar [data-choice-value="${value}"]`).click()
  const response: SessionResponse = await (await sent).json()
  expect(response.ok, response.error).toBe(true)
  return response
}

for (const operation of ['room', 'stable', 'plow', 'sow'] as const) {
  test(`${operation} focuses the farm and confirms an authoritative ordinary target`, async ({ page, request }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await prepare(page, request, state => {
      if (operation === 'sow') state.players[0]!.fields = [{ row: 0, col: 1, stacks: [] }]
    })
    let response = await action(page, operation === 'room' || operation === 'stable' ? 'farm-expansion' : operation === 'plow' ? 'farmland' : 'grain-utilization')
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      const label = operation === 'room' ? 'actions.construct.name' : operation === 'stable' ? 'actions.buildStable.name' : 'actions.sow.name'
      const option = response.interaction.request.options.find(option => option.labelKey === label || (operation === 'stable' && option.labelKey === 'actions.stables.name'))
      if (!option) throw new Error(`Expected ${operation}: ${JSON.stringify(response.interaction.request)}`)
      response = await choice(page, option.value)
    }
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') throw new Error('Expected farm input')
    const selection = response.interaction.request.farm
    await expectFarmVisible(page)
    if (selection.farmType === 'sow') await farm(page).locator('.sow-choice-button[title="Grain"]').first().click()
    else if (selection.farmType !== 'fence') {
      const tile = selection.selectableTiles[0]
      if (!tile) throw new Error('Expected a legal farm tile')
      await farm(page).locator(`[data-farm-tile-key="${tile.row}-${tile.col}"]`).click()
    }
    const confirm = page.locator('.interaction-bar [data-choice-value="confirm"]')
    await expect(confirm).toBeEnabled()
    const visible = await confirm.evaluate(element => {
      const bounds = element.getBoundingClientRect()
      return bounds.top >= 0 && bounds.bottom <= innerHeight
    })
    expect(visible).toBe(true)
    const committed = page.waitForResponse(response => response.url().endsWith('/api/game/commit-selection'))
    await confirm.click()
    const after: SessionResponse = await (await committed).json()
    expect(after.ok, after.error).toBe(true)
    const player = after.state.players[0]!
    if (operation === 'room') expect(player.rooms).toBe(3)
    if (operation === 'stable') expect(player.stableTiles).toHaveLength(1)
    if (operation === 'plow') expect(player.fields).toHaveLength(1)
    if (operation === 'sow') expect(player.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
  })
}

for (const viewport of [{ width: 375, height: 812 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
  test(`fence touch targets remain distinct and above the operation bar at ${viewport.width}x${viewport.height}`, async ({ browser, request }) => {
    const context = await browser.newContext({ viewport, hasTouch: true })
    const page = await context.newPage()
    try {
      await prepare(page, request)
      await action(page, 'fencing')
      await expectFarmVisible(page)
      for (const edge of ['H-2-2', 'H-3-2', 'V-2-2', 'V-2-3']) {
        const control = farm(page).locator(`[data-fence-edge="${edge}"] .farm-fence-hit`)
        const bounds = await control.boundingBox()
        expect(bounds).not.toBeNull()
        expect(Math.min(bounds!.height, bounds!.width)).toBeGreaterThanOrEqual(36)
        expect(await control.evaluate(element => {
          const bounds = element.getBoundingClientRect()
          return document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)?.getAttribute('aria-label')
        })).toBe(await control.getAttribute('aria-label'))
        await control.tap({ timeout: 5000, position: edge.startsWith('H-')
          ? { x: bounds!.width / 2, y: bounds!.height / 2 + 10 }
          : { x: bounds!.width / 2 + 10, y: bounds!.height / 2 } })
        await expect(control).toHaveAttribute('aria-pressed', 'true')
      }
      await expect(page.locator('.interaction-bar')).toContainText('Selected 4 edges')
      await expect(page.getByTestId('fence-selection-cost')).toHaveText('Cost: 4 wood')
      await page.screenshot({ path: `output/playwright/farm-focus-fence-active-${viewport.width}x${viewport.height}.png` })
      const committed = page.waitForResponse(response => response.url().endsWith('/api/game/commit-selection'))
      await page.locator('.interaction-bar [data-choice-value="confirm"]').tap()
      const after: SessionResponse = await (await committed).json()
      expect(after.ok, after.error).toBe(true)
      expect(after.state.players[0]!.fenceSegments).toHaveLength(4)
      expect(after.state.players[0]!.resources.wood).toBe(16)
      await page.screenshot({ path: `output/playwright/farm-focus-fence-${viewport.width}x${viewport.height}.png` })
    } finally { await context.close() }
  })
}

test('an extended farm remains visible and accepts a legal outer field target', async ({ page, request }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await prepare(page, request, state => {
    state.players[0]!.farmyardExtensions = [{ id: 'north-extension', tiles: [{ row: -1, col: 1 }] }]
  })
  await action(page, 'farmland')
  await expectFarmVisible(page)
  const target = farm(page).locator('[data-farm-tile-key="-1-1"]')
  await expect(target).toHaveClass(/selectable/)
  await target.click()
  const committed = page.waitForResponse(response => response.url().endsWith('/api/game/commit-selection'))
  await page.locator('.interaction-bar [data-choice-value="confirm"]').click()
  const after: SessionResponse = await (await committed).json()
  expect(after.ok, after.error).toBe(true)
  expect(after.state.players[0]!.fields).toEqual([{ row: -1, col: 1, stacks: [] }])
})

test('collecting animals focuses their farm holders and keeps the confirmation visible', async ({ page, request }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await prepare(page, request, state => {
    state.players[0]!.pastures = [{ id: 'animal-target', size: 1, tiles: [{ row: 2, col: 2 }], stables: 0, animalType: null, animalCount: 0 }]
    state.players[0]!.fenceSegments = ['H-2-2', 'H-3-2', 'V-2-2', 'V-2-3'].map(edge => ({ edge, type: 'fence' }))
    state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep = 2
  })
  await action(page, 'sheep-market')
  await expectFarmVisible(page)
  const confirm = page.locator('.interaction-reorg-panel').getByRole('button', { name: 'Confirm', exact: true })
  await expect(confirm).toBeEnabled()
  const committed = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
  await confirm.click()
  const after: SessionResponse = await (await committed).json()
  expect(after.ok, after.error).toBe(true)
  expect(after.state.players[0]!.resources.sheep).toBe(2)
  expect(after.state.players[0]!.pastures[0]!.animalCount).toBe(2)
})

test('a card-granted plow focuses the farm before the wood action finishes', async ({ page, request }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await prepare(page, request, state => { state.players[0]!.occupationPlayed = ['A091_ShiftingCultivator'] })
  let response = await action(page, 'forest')
  for (let step = 0; step < 4 && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice'; step++) {
    const option = response.interaction.request.options.find(option => option.value !== '__skip__')
    if (!option) throw new Error('Expected the card-granted plow')
    response = await choice(page, option.value)
  }
  await expectFarmVisible(page)
  await farm(page).locator('.farm-tile.selectable').first().click()
  const committed = page.waitForResponse(response => response.url().endsWith('/api/game/commit-selection'))
  await page.locator('.interaction-bar [data-choice-value="confirm"]').click()
  const after: SessionResponse = await (await committed).json()
  expect(after.ok, after.error).toBe(true)
  expect(after.state.players[0]!.fields).toHaveLength(1)
  expect(after.state.players[0]!.resources.food).toBe(7)
})

test('local Moor terrain selection focuses the farm before submitting a special action', async ({ page, request }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await prepare(page, request, state => { state.players[0]!.farmTerrain = [{ row: 2, col: 2, kind: 'moor' }] }, true)
  await page.locator('.special-actions-panel').getByRole('button', { name: 'Cut Peat', exact: true }).click()
  await expectFarmVisible(page)
  const tile = farm(page).locator('[data-farm-tile-key="2-2"]')
  await expect(tile).toHaveClass(/selectable/)
  const committed = page.waitForResponse(response => response.url().endsWith('/api/game/special-action'))
  await tile.click()
  const after: SessionResponse = await (await committed).json()
  expect(after.ok, after.error).toBe(true)
  expect(after.state.players[0]!.farmTerrain).toEqual([])
})
