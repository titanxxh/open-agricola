import { expect, test, type Page } from '@playwright/test'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'
import { markAllWorkersUsed } from '../shared/domain/player'
import { emptyResources } from '../shared/contract/state-constants'
import { joinRoomClients, roomDriver, roomSnapshot } from './room-command-driver'

test('wood conversion and heating share the exchange center in a synchronized room', async ({ browser, request }, testInfo) => {
  const pages: [Page, Page] = [await browser.newPage(), await browser.newPage()]
  try {
    await joinRoomClients(pages, request)
    const driver = roomDriver(pages)
    const fixture = createWorkSession({ seed: 5401, options: {
      enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true,
    }, configure: state => {
      state.round = 4
      for (const space of state.actionSpaces) space.takenBy = []
      for (const player of state.players) {
        player.resources = { ...emptyResources, food: 4, fuel: 2 }
        player.farmTerrain = []
        player.fields = []
        player.pastures = []
        player.improvements = []
        player.minorPlayed = []
        player.occupationPlayed = []
        player.cardStates = {}
        markAllWorkersUsed(state, player)
      }
      const occupied = state.actionSpaces[0]!
      for (const player of state.players) for (const worker of player.workers) {
        if (worker.isActive) occupied.takenBy.push({ playerId: player.id, workerId: worker.id })
      }
      Object.assign(state.players[0]!.resources, { wood: 1, fuel: 1 })
    } })
    const initial = fixture.withCtx(() => serializeState(fixture.state, {}))
    fixture.dispose()
    await driver.command(0, { type: 'loadGame', state: initial })
    const page = pages[0]
    await expect(page.locator('[data-anytime-action-id="moor-wood-to-fuel"]')).toHaveCount(0)
    await driver.ui(0, () => page.locator('[data-anytime-action-id="exchange"]').click())
    const ordinaryWood = page.locator('[data-testid^="anytime-exchange-option-__basic__-"]')
    await expect(ordinaryWood).toContainText('Basic conversion')
    await ordinaryWood.getByRole('button', { name: '+', exact: true }).click()
    await driver.ui(0, () => page.locator('.exchange-overlay .exchange-confirm').click())
    expect((await roomSnapshot(page)).state.players[0]!.resources).toMatchObject({ wood: 0, fuel: 2 })

    await driver.command(0, { type: 'loadGame', state: initial })
    await driver.command(0, { type: 'roundEnd' })
    for (let step = 0; step < 8; step++) {
      const current = await roomSnapshot(page)
      if (current.interaction.stateId !== 'wait') throw new Error('Expected harvest interaction')
      const actor = current.interaction.playerIndex
      const own = await roomSnapshot(pages[actor]!)
      if (own.interaction.stateId !== 'wait') throw new Error('Expected responder')
      if (own.interaction.request.kind === 'heating') break
      await driver.command(actor, { type: 'choice', value: '__skip__' })
    }
    await expect(page.locator('.exchange-overlay')).toHaveCount(1)
    await expect(page.locator('.exchange-title')).toHaveText('Exchange Center')
    await expect(page.locator('.exchange-overlay')).toContainText('1/2 fuel · Newly sick 1')
    await expect(page.locator('.interaction-bar input[type="number"]')).toHaveCount(0)
    const heatingWood = page.getByTestId('heating-option-__basic__-ex2')
    await heatingWood.getByRole('button', { name: '+', exact: true }).click()
    await expect(page.locator('.exchange-overlay')).toContainText('2/2 fuel · Newly sick 0')
    await page.screenshot({ path: testInfo.outputPath('heating-exchange-center.png') })
    await driver.ui(0, () => page.locator('.exchange-overlay .exchange-confirm').click())
    for (const currentPage of pages) {
      const current = await roomSnapshot(currentPage)
      expect(current.state.players[0]!.resources).toMatchObject({ food: 0, wood: 0, fuel: 0 })
      expect(current.state.players[0]!.sickWorkerIds).toEqual([])
    }
    await expect(page.locator('.exchange-overlay')).toHaveCount(0)
    await expect(pages[1].locator('.exchange-overlay')).toContainText('2/2 fuel · Newly sick 0')
    await driver.ui(1, () => pages[1].locator('.exchange-overlay .exchange-confirm').click())
    await expect(pages[1].locator('.exchange-overlay')).toHaveCount(0)
  } finally { await Promise.all(pages.map(page => page.close())) }
})
