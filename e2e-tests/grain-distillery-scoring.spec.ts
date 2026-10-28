import { expect, test, type Page } from '@playwright/test'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'
import { markAllWorkersUsed } from '../shared/domain/player'
import { emptyResources } from '../shared/contract/state-constants'
import { joinRoomClients, roomDriver, roomSnapshot } from './room-command-driver'

const CARD_ID = 'M108_GrainDistillery'

for (const scenario of [
  { pairs: 0, width: 1920 },
  { pairs: 1, width: 375 },
]) {
  test(`Grain Distillery can choose ${scenario.pairs} scoring pair and restore both clients at ${scenario.width}px`, async ({ browser, request }, testInfo) => {
    const pages: [Page, Page] = [await browser.newPage(), await browser.newPage()]
    try {
      await pages[0].setViewportSize({ width: scenario.width, height: 900 })
      await joinRoomClients(pages, request)
      const driver = roomDriver(pages)
      const fixture = createWorkSession({ seed: 428029, options: {
        enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true,
      }, configure: state => {
        state.round = 14
        for (const player of state.players) {
          player.resources = { ...emptyResources, food: 20, fuel: 3 }
          player.farmTerrain = []
          player.fields = []
          player.pastures = []
          player.improvements = []
          player.minorPlayed = []
          player.occupationPlayed = []
          player.cardStates = {}
          markAllWorkersUsed(state, player)
        }
        const spaces = state.actionSpaces.filter(space => space.id !== '__test-worker-sink__')
        let position = 0
        for (const player of state.players) for (const worker of player.workers) {
          if (worker.isActive) spaces[position++]!.takenBy.push({ playerId: player.id, workerId: worker.id })
        }
        state.players[0]!.minorPlayed = [CARD_ID]
        state.players[0]!.resources.grain = 1
      } })
      const initial = fixture.withCtx(() => serializeState(fixture.state, { actionHooks: fixture.actionHooks }))
      fixture.dispose()
      await driver.command(0, { type: 'loadGame', state: initial })
      await driver.command(0, { type: 'roundEnd' })

      for (let step = 0; step < 30; step++) {
        const current = await roomSnapshot(pages[0])
        if (current.interaction.stateId !== 'wait') throw new Error('Expected a final Harvest or scoring choice')
        const { playerIndex } = current.interaction
        const owner = await roomSnapshot(pages[playerIndex]!)
        if (owner.interaction.stateId !== 'wait') throw new Error('Expected the responding player to have a Harvest choice')
        const pending = owner.interaction.request
        if (pending.kind === 'choice' && pending.options.some(option => option.sourceCard === CARD_ID)) break
        if (pending.kind === 'feed') await driver.command(playerIndex, { type: 'choice', value: 'confirm', payload: { selections: [] } })
        else if (pending.kind === 'heating') await driver.command(playerIndex, { type: 'choice', value: 'confirm', payload: { fuelUsed: pending.required, woodToFuel: 0 } })
        else if (pending.kind === 'confirm-next-player' || pending.kind === 'confirm-player-switch') {
          await driver.command(playerIndex, { type: 'choice', value: 'confirm' })
        } else if (pending.kind === 'choice' && pending.options.some(option => option.value === '__skip__')) {
          await driver.command(playerIndex, { type: 'choice', value: '__skip__' })
        } else throw new Error(`Unexpected final Harvest choice: ${JSON.stringify(current.interaction)}`)
      }

      const page = pages[0]
      const outer = await roomSnapshot(page)
      expect(outer.state.gameOver).toBe(false)
      expect(outer.state.players[0]!.resources).toMatchObject({ grain: 1, fuel: 1, food: 16 })
      if (outer.interaction.stateId !== 'wait' || outer.interaction.request.kind !== 'choice') throw new Error('Missing scoring window')
      const entry = outer.interaction.request.options.find(option => option.sourceCard === CARD_ID)
      expect(entry).toBeDefined()
      await driver.ui(0, () => page.locator(`[data-choice-value="${entry!.value}"]`).click())
      for (const pairs of [0, 1]) await expect(page.locator(`[data-choice-value="${CARD_ID}:pairs:${pairs}"]`)).toBeVisible()
      await driver.reload()
      const choice = page.locator(`[data-choice-value="${CARD_ID}:pairs:${scenario.pairs}"]`)
      await expect(choice).toBeInViewport()
      await page.screenshot({ path: testInfo.outputPath('scoring-quantity-menu.png') })
      await driver.ui(0, () => choice.click())
      let current = await roomSnapshot(page)
      if (!current.state.gameOver) {
        await driver.ui(0, () => page.locator('[data-choice-value="__skip__"]').click())
        current = await roomSnapshot(page)
      }
      expect(current.state.gameOver).toBe(true)
      await driver.reload()
      for (const client of pages) {
        const saved = await roomSnapshot(client)
        expect(saved.state.players[0]!.resources).toMatchObject({ grain: 1 - scenario.pairs, fuel: 1 - scenario.pairs, food: 16 })
        const entries = saved.scores?.[0]?.categories.find(category => category.key === 'cardBonusVp')?.entries ?? []
        expect(entries.find(entry => entry.type === 'bonus' && entry.cardId === CARD_ID)?.score ?? 0).toBe(scenario.pairs)
      }
      const pad = page.locator('.scoring-pad')
      if (!await pad.isVisible()) await page.getByRole('button', { name: 'Scoring Pad', exact: true }).click()
      await expect(pad).toBeVisible()
      const grainRow = pad.locator('.scoring-row').filter({ has: page.locator('.scoring-label').getByText('Grain', { exact: true }) })
      await expect(grainRow.locator('.scoring-cell-value')).toHaveText([scenario.pairs ? '-1' : '+1', '-1'])
      await pad.screenshot({ path: testInfo.outputPath('final-scoring-pad.png') })
    } finally { await Promise.all(pages.map(page => page.close())) }
  })
}
