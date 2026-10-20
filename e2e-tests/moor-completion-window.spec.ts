import { expect, test, type Page } from '@playwright/test'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'
import { setWorkersAtHome } from '../shared/domain/player'
import { joinRoomClients, publicRoomState, roomDriver, roomSnapshot } from './room-command-driver'

const ALMANAC = 'E018_SeedAlmanac', MACHINE = 'M060_SowingMachine'

for (const almanacFirst of [true, false]) test(`Moor and improvement after share a live room window, Almanac first=${almanacFirst}`, async ({ browser, request }) => {
  const pages: [Page, Page] = [await browser.newPage(), await browser.newPage()]
  try {
    await joinRoomClients(pages, request)
    const driver = roomDriver(pages)
    const fixture = createWorkSession({ seed: 1293, options: {
      enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true,
    }, configure: state => {
      state.round = 8
      for (const space of state.actionSpaces) space.takenBy = []
      for (const p of state.players) {
        for (const key of Object.keys(p.resources)) Reflect.set(p.resources, key, 0)
        p.minorPlayed = []
        p.occupationPlayed = []
        p.cardStates = {}
        p.rooms = 2
        p.roomTiles = [{ row: 2, col: 3 }, { row: 2, col: 4 }]
        p.fields = [{ row: 0, col: 1, stacks: [] }]
        p.pastures = []
        p.stableTiles = []
        p.farmTerrain = [{ row: 0, col: 0, kind: 'forest' }, { row: 2, col: 0, kind: 'moor' }]
        setWorkersAtHome(state, p, 2)
      }
      const p = state.players[0]!
      p.minorPlayed = [ALMANAC, MACHINE]
      p.occupationPlayed = ['A085_Academic', 'A086_Braggart', 'A087_CarriageDriver', 'A088_FenceDealer']
      p.minorHand = ['A032_Manger']
      Object.assign(p.resources, { horse: 2, grain: 2, food: 1, fuel: 1, wood: 2 })
      p.pastures = [{ id: 'horses', size: 2, tiles: [{ row: 1, col: 3 }, { row: 1, col: 4 }], stables: 0, animalType: 'horse', animalCount: 2 }]
    } })
    try { await driver.command(0, { type: 'loadGame', state: fixture.withCtx(() => serializeState(fixture.state, {})) }) }
    finally { fixture.dispose() }
    const page = pages[0]
    const agree = async () => {
      const current = await roomSnapshot(page)
      expect(publicRoomState(await roomSnapshot(pages[1]))).toEqual(publicRoomState(current))
      return current
    }
    const choose = async (value: string) => {
      await driver.ui(0, () => page.locator(`.interaction-bar [data-choice-value="${value}"]`).click())
      return agree()
    }
    const accept = async (card: string) => {
      let current = await roomSnapshot(page)
      if (current.interaction.stateId === 'wait' && current.interaction.request.kind === 'select-trigger') {
        const trigger = current.interaction.request.options.find(option => option.sourceCard === card)!
        current = await choose(trigger.value)
      }
      expect(current.interaction).toMatchObject({ stateId: 'wait', sourceCard: card })
      if (current.interaction.stateId !== 'wait') throw new Error('Expected optional reaction')
      const activation = (current.interaction.request.options ?? []).find(option => option.value !== '__skip__' && !option.disabled)
      if (!activation) throw new Error('Expected enabled reaction')
      await choose(activation.value)
    }
    const plow = async () => {
      await accept(ALMANAC)
      await page.locator('[data-farm-tile-player="p1"][data-farm-tile-key="0-2"]').click()
      await driver.ui(0, () => page.getByRole('button', { name: 'Confirm plow', exact: true }).click())
    }
    const sow = async () => {
      await accept(MACHINE)
      const count = almanacFirst ? 2 : 1
      const grain = page.locator('[data-farm-tile-player="p1"] .sow-choice-button[title="Grain"]')
      await expect(grain).toHaveCount(count)
      for (let index = 0; index < count; index++) await grain.nth(index).click()
      await driver.ui(0, () => page.getByRole('button', { name: 'Confirm sowing', exact: true }).click())
    }
    await driver.ui(0, () => page.locator('.special-actions-panel').getByRole('button', { name: 'Black Market', exact: true }).click())
    let current = await agree()
    expect(current.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'select-trigger' } })
    expect(current.state.players[0]!.resources).toMatchObject({ wood: 0, fuel: 0 })
    await expect(page.locator(`.interaction-bar [data-choice-value="${ALMANAC}"]`)).toBeVisible()
    await expect(page.locator(`.interaction-bar [data-choice-value="${MACHINE}"]`)).toBeVisible()
    await driver.reload()
    expect((await agree()).interaction).toEqual(current.interaction)
    if (almanacFirst) { await plow(); await sow() } else { await sow(); await plow() }
    current = await agree()
    expect(current.state.players[0]!.resources).toMatchObject({ grain: almanacFirst ? 0 : 1, food: 0 })
    expect(current.state.players[0]!.fields.map(field => field.stacks)).toEqual([
      [{ kind: 'grain', remaining: 3 }], almanacFirst ? [{ kind: 'grain', remaining: 3 }] : [],
    ])
    expect(current.scores[0]!.categories.find(category => category.key === 'grains')).toMatchObject({ quantity: 2, total: 1 })
    await page.screenshot({ path: `output/playwright/moor-completion-${almanacFirst ? 'plow-first' : 'sow-first'}.png` })
  } finally { await Promise.all(pages.map(page => page.close())) }
})
