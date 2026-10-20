import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { setWorkersAtHome } from '../shared/domain/player'
import { serializeState } from '../shared/session/serialization'
import type { SessionResponse } from '../shared/contract/types'
import { BACKEND_URL } from './fixtures'

async function prepare(request: APIRequestContext, scheduled: boolean) {
  expect((await request.post(`${BACKEND_URL}/api/game/new-sandbox`, { data: {
    seed: 1308, playerCount: 2, customCardIds: [], enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  } })).ok()).toBe(true)
  const fixture = createWorkSession({ seed: 1308, options: {
    enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true,
  }, configure: state => {
    state.round = scheduled ? 5 : 7
    for (const player of state.players) {
      for (const resource of Object.keys(player.resources)) Reflect.set(player.resources, resource, 0)
      player.farmTerrain = [{ row: 0, col: 0, kind: 'forest' }, { row: 2, col: 0, kind: 'moor' }, { row: 1, col: 0, kind: 'moor' }]
      player.fields = []
      player.rooms = 2
      player.roomTiles = [{ row: 2, col: 3 }, { row: 2, col: 4 }]
      setWorkersAtHome(state, player, 2)
      if (scheduled) for (const worker of player.workers.filter(worker => worker.isActive)) {
        state.actionSpaces[0]!.takenBy.push({ playerId: player.id, workerId: worker.id })
      }
    }
    const player = state.players[0]!
    player.minorPlayed = [scheduled ? 'M056_PeatCuttingRights' : 'M055_ToolShed', 'M112_PeatAshFertilizer']
    player.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] }]
    if (scheduled) player.cardStates.M056_PeatCuttingRights = { extraData: { scheduledOffers: [{
      id: 'browser-rights-round6', kind: 'moor-special-action', dueRound: 6,
      actionId: 'cut-peat', consumed: false,
    }] } }
  } })
  try {
    expect((await request.post(`${BACKEND_URL}/api/game/load`, {
      data: { state: fixture.withCtx(() => serializeState(fixture.state, {})) },
    })).ok()).toBe(true)
  } finally { fixture.dispose() }
}

async function clickChoice(page: Page) {
  const committed = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
  await page.locator('.interaction-bar [data-choice-value]').filter({ hasNotText: 'Skip' }).first().click()
  const response: SessionResponse = await (await committed).json()
  expect(response.ok, response.error).toBe(true)
  return response
}

for (const scheduled of [false, true]) {
  test(`granted Cut Peat opens Peat Ash Fertilizer before clearing, scheduled=${scheduled}`, async ({ page, request }) => {
    await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
    await prepare(request, scheduled)
    if (scheduled) {
      const response: SessionResponse = await (await request.post(`${BACKEND_URL}/api/game/round-end`)).json()
      expect(response.ok, response.error).toBe(true)
      expect(response.state.round).toBe(6)
    }
    await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
    if (!scheduled) {
      await page.locator('.special-actions-panel').getByRole('button', { name: 'Slash and Burn', exact: true }).click()
      await page.locator('[data-farm-tile-player="p1"][data-farm-tile-key="0-0"]').click()
    }
    const activated = await clickChoice(page)
    expect(activated.interaction.sourceCard).toBe(scheduled ? 'M056_PeatCuttingRights' : 'M055_ToolShed')
    const tile = page.locator('[data-farm-tile-player="p1"][data-farm-tile-key="2-0"]')
    const selected = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
    if (scheduled) {
      await expect(tile).toHaveClass(/position-selectable/)
      await tile.click()
    } else {
      await page.locator('.interaction-bar [data-choice-value="action:cut-peat:2:0"]').click()
    }
    const before: SessionResponse = await (await selected).json()
    expect(before.interaction.sourceCard).toBe('M112_PeatAshFertilizer')
    expect(before.state.players[0]!.resources.fuel).toBe(0)
    await page.reload()
    await expect(page.locator('.interaction-bar')).toContainText('Peat Ash Fertilizer')
    const result = await clickChoice(page)
    expect(result.state.players[0]!.fields.find(field => field.row === 0 && field.col === 1)?.stacks)
      .toEqual([{ kind: 'grain', remaining: 3 }])
    expect(result.state.players[0]!.resources.fuel).toBe(3)
    expect(result.state.players[0]!.farmTerrain).not.toContainEqual({ row: 2, col: 0, kind: 'moor' })
    if (scheduled) expect(result.state.players[0]!.cardStates.M056_PeatCuttingRights?.extraData?.scheduledOffers)
      .toEqual([expect.objectContaining({ consumed: true, consumedRound: 6 })])
    else expect(result.state.players[0]!.cardStates.M055_ToolShed?.counters?.usage).toBe(7)
    await page.screenshot({ path: `output/playwright/granted-moor-${scheduled ? 'scheduled' : 'tool-shed'}.png` })
  })
}
