import { expect, test } from '@playwright/test'
import { GameSession } from '../server/game/authoritative-session'
import { serializeState } from '../shared/session/serialization'
import type { SerializedGameState } from '../shared/session/serialization'
import { BACKEND_URL } from './fixtures'

for (const scenario of [{ locale: 'en', width: 1440 }, { locale: 'zh', width: 390 }] as const) {
  for (const target of ['farm', 'card'] as const) {
    test(`whole-field ${target} choices click farm and Card Fields in ${scenario.locale} at ${scenario.width}px`, async ({ page, request }) => {
      await page.setViewportSize({ width: scenario.width, height: 1000 })
      await page.addInitScript((locale) => localStorage.setItem('open-agricola-locale-v2', locale), scenario.locale)
      const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, { data: { seed: 1073, playerCount: 2, customCardIds: [] } })
      expect(fresh.ok()).toBe(true)
      const { state } = await fresh.json() as { state: SerializedGameState }
      state.round = 4
      for (const player of state.players) {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.resources.food = 20
        for (const worker of player.workers.filter((candidate) => candidate.isActive)) state.actionSpaces[0]!.takenBy.push({ playerId: player.id, workerId: worker.id })
      }
      const owner = state.players[0]!
      owner.minorPlayed = ['E073_Scythe', 'D075_WoodField']
      owner.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] }]
      owner.cardStates.D075_WoodField = { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 3 }, { crop: 'wood', remaining: 2 }] } }
      expect((await request.post(`${BACKEND_URL}/api/game/load`, { data: { state } })).ok()).toBe(true)
      expect((await request.post(`${BACKEND_URL}/api/game/round-end`)).ok()).toBe(true)
      await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
      const farm = page.locator('[data-farm-tile-player="p1"][data-farm-tile-key="0-2"]')
      await expect(farm).toHaveClass(/position-selectable/)
      // The crop strip is a visible sibling of the card anchor, independent of hover.
      const cardSlots = page.locator('.played-card-slot').filter({ has: page.locator('[data-card-anchor="D075_WoodField"]') }).locator('.card-field-selection')
      await expect(cardSlots).toHaveCount(2)
      await page.reload()
      await expect(cardSlots).toHaveCount(2)
      await page.locator('[data-farm-tile-player="p1"][data-farm-tile-key="1-1"]').click()
      await expect(cardSlots).toHaveCount(2)
      const unchanged = await (await request.get(`${BACKEND_URL}/api/game/state`)).json()
      expect(unchanged.state.players[0].fields[0].stacks[0].remaining).toBe(3)
      const selected = page.waitForResponse((response) => response.url().endsWith('/api/game/choice'))
      if (target === 'card') await cardSlots.last().click()
      else await farm.click()
      const result = await (await selected).json()
      expect(result.ok, JSON.stringify(result)).toBe(true)
      if (target === 'card') {
        expect(result.state.players[0].cardStatePresentation.D075_WoodField.cropLayers).toEqual([])
        expect(result.state.players[0].fields[0].stacks[0].remaining).toBe(2)
      } else {
        expect(result.state.players[0].fields[0].stacks).toEqual([])
        expect(result.state.players[0].cardStatePresentation.D075_WoodField.cropLayers.map((layer: { stack: { remaining: number } }) => layer.stack.remaining)).toEqual([2, 1])
      }
      await expect(cardSlots).toHaveCount(0)
      await page.screenshot({ path: `output/playwright/choice-${target}-field-${scenario.locale}.png` })
    })
  }
}

for (const scenario of [{ locale: 'en', width: 1440 }, { locale: 'zh', width: 390 }] as const) {
  test(`Peat Sled displays four distinct executable schedules in ${scenario.locale}`, async ({ page, request }) => {
    await page.setViewportSize({ width: scenario.width, height: 1000 })
    await page.addInitScript((locale) => localStorage.setItem('open-agricola-locale-v2', locale), scenario.locale)
    const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, { data: { seed: 1079, playerCount: 2, customCardIds: [], enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true } })
    const { state } = await fresh.json() as { state: SerializedGameState }
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.farmTerrain = []
      player.resources.wood = 20
      player.resources.fuel = 20
    }
    state.players[0]!.minorHand = ['M079_PeatSled']
    expect((await request.post(`${BACKEND_URL}/api/game/load`, { data: { state } })).ok()).toBe(true)
    let response = await (await request.post(`${BACKEND_URL}/api/game/action`, { data: { playerIndex: 0, spaceId: 'meeting-place' } })).json()
    for (let i = 0; i < 8 && !response.state.players[0].minorPlayed.includes('M079_PeatSled'); i += 1) {
      const choice = response.interaction.request.options.find((option: { value: string }) => option.value === 'M079_PeatSled' || option.value.startsWith('action-improvement-'))
      expect(choice).toBeDefined()
      response = await (await request.post(`${BACKEND_URL}/api/game/choice`, { data: { playerIndex: 0, value: choice.value } })).json()
      expect(response.ok).toBe(true)
    }
    await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
    const plans = page.locator('.interaction-future-schedule')
    await expect(plans).toHaveCount(4)
    await expect(plans.first()).toContainText(scenario.locale === 'en' ? 'Round 3:' : '第 3 回合：')
    await expect(plans.last()).toContainText(scenario.locale === 'en' ? 'Round 11:' : '第 11 回合：')
    await expect(plans.first().locator('[data-resource="fuel"]')).toHaveAttribute('data-amount', '3')
    await expect(plans.last().locator('[data-resource="fuel"]')).toHaveAttribute('data-amount', '6')
    await page.screenshot({ path: `output/playwright/choice-peat-sled-${scenario.locale}.png` })
    const committed = page.waitForResponse((result) => result.url().endsWith('/api/game/choice'))
    await plans.last().click()
    const result = await (await committed).json()
    expect(result.ok).toBe(true)
    expect(result.state.futureMeeples).toEqual([expect.objectContaining({ round: 11, resources: { fuel: 6 } })])
  })
}

test('skipping a spatial Scythe choice retains normal field harvesting', async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, { data: { seed: 2073, playerCount: 2, customCardIds: [] } })
  const { state } = await fresh.json() as { state: SerializedGameState }
  state.round = 4
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources.food = 20
    for (const worker of player.workers.filter((candidate) => candidate.isActive)) state.actionSpaces[0]!.takenBy.push({ playerId: player.id, workerId: worker.id })
  }
  state.players[0]!.minorPlayed = ['E073_Scythe']
  state.players[0]!.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] }]
  expect((await request.post(`${BACKEND_URL}/api/game/load`, { data: { state } })).ok()).toBe(true)
  expect((await request.post(`${BACKEND_URL}/api/game/round-end`)).ok()).toBe(true)
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  await expect(page.locator('[data-farm-tile-player="p1"][data-farm-tile-key="0-2"]')).toHaveClass(/position-selectable/)
  const submitted = page.waitForResponse((result) => result.url().endsWith('/api/game/choice'))
  await page.locator('.interaction-bar').getByRole('button', { name: 'Skip', exact: true }).click()
  const result = await (await submitted).json()
  expect(result.ok).toBe(true)
  expect(result.state.players[0].fields[0].stacks[0].remaining).toBe(2)
  expect(result.state.players[0].resources.grain).toBe(1)
})

test('one farm cell with multiple authoritative options requires an explicit action-card choice', async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  // Solo Moor rules provide several distinct physical cards offering Cut Peat.
  const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, { data: { seed: 1056, playerCount: 1, customCardIds: [], enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true } })
  expect(fresh.ok()).toBe(true)
  const solo = new GameSession(1056, undefined, { playerCount: 1, enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true })
  const state = solo.withCtx(() => serializeState(solo.state, {}))
  state.round = 5
  const owner = state.players[0]!
  owner.minorHand = ['__test_placeholder__']
  owner.occupationHand = ['__test_placeholder__']
  owner.minorPlayed = ['M056_PeatCuttingRights']
  owner.resources.food = 20
  owner.resources.fuel = 20
  owner.farmTerrain = [{ row: 2, col: 1, kind: 'moor' }]
  for (const worker of owner.workers.filter((candidate) => candidate.isActive)) state.actionSpaces[0]!.takenBy.push({ playerId: owner.id, workerId: worker.id })
  owner.cardStates.M056_PeatCuttingRights = { extraData: { scheduledOffers: [{ id: 'browser-cut-peat', kind: 'moor-special-action', dueRound: 6, actionId: 'cut-peat', consumed: false }] } }
  expect((await request.post(`${BACKEND_URL}/api/game/load`, { data: { state } })).ok()).toBe(true)
  expect((await request.post(`${BACKEND_URL}/api/game/round-end`)).ok()).toBe(true)
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  const tile = page.locator('[data-farm-tile-player="p1"][data-farm-tile-key="2-1"]')
  await expect(tile).toHaveClass(/position-selectable/)
  await tile.click()
  const sources = page.locator('.interaction-bar [data-target-card]')
  await expect(sources).toHaveCount(3)
  const before = await (await request.get(`${BACKEND_URL}/api/game/state`)).json()
  expect(before.state.players[0].farmTerrain).toHaveLength(1)
  const committed = page.waitForResponse((response) => response.url().endsWith('/api/game/choice'))
  await sources.first().locator('..').locator('..').click()
  const result = await (await committed).json()
  expect(result.ok, JSON.stringify(result)).toBe(true)
  expect(result.state.players[0].farmTerrain).toHaveLength(0)
})
