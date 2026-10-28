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
    const driver = roomDriver(pages)
    let joined = false
    try {
      await pages[0].setViewportSize({ width: scenario.width, height: 900 })
      await joinRoomClients(pages, request)
      joined = true
      const fixture = createWorkSession({ seed: 428029, options: {
        enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true,
      }, configure: state => {
        state.round = 14
        for (const player of state.players) {
          player.resources = { ...emptyResources, food: 20, fuel: 4 }
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
        state.players[0]!.resources.grain = 2
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
      expect(outer.state.players[0]!.resources).toMatchObject({ grain: 2, fuel: 2, food: 16 })
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
      expect(current.state.gameOver).toBe(false)
      expect(current.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice' } })
      await driver.reload()
      for (const client of pages) {
        const saved = await roomSnapshot(client)
        expect(saved.state.gameOver).toBe(false)
        expect(saved.state.players[0]!.resources).toMatchObject({ grain: 2 - scenario.pairs, fuel: 2 - scenario.pairs, food: 16 })
        const entries = saved.scores?.[0]?.categories.find(category => category.key === 'cardBonusVp')?.entries ?? []
        expect(entries.find(entry => entry.type === 'bonus' && entry.cardId === CARD_ID)?.score ?? 0).toBe(scenario.pairs)
        expect(saved.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === CARD_ID)).toHaveLength(scenario.pairs)
      }
      await page.screenshot({ path: testInfo.outputPath('restored-after-choice.png') })
      await driver.ui(0, () => page.locator('[data-choice-value="__skip__"]').click())
      current = await roomSnapshot(page)
      expect(current.state.gameOver).toBe(true)
      for (const client of pages) {
        const finished = await roomSnapshot(client)
        expect(finished.state.gameOver).toBe(true)
        expect(finished.state.players[0]!.resources).toMatchObject({ grain: 2 - scenario.pairs, fuel: 2 - scenario.pairs, food: 16 })
        expect(finished.scores?.[0]?.categories.find(category => category.key === 'grains')).toMatchObject({ quantity: 2 - scenario.pairs, total: 1 })
        const entries = finished.scores?.[0]?.categories.find(category => category.key === 'cardBonusVp')?.entries ?? []
        expect(entries.find(entry => entry.type === 'bonus' && entry.cardId === CARD_ID)?.score ?? 0).toBe(scenario.pairs)
      }
      const pad = page.locator('.scoring-pad')
      if (!await pad.isVisible()) await page.getByRole('button', { name: 'Scoring Pad', exact: true }).click()
      await expect(pad).toBeVisible()
      await expect(page.locator('.scoring-overlay')).toHaveCSS('opacity', '1')
      const grainRow = pad.locator('.scoring-row').filter({ has: page.locator('.scoring-label').getByText('Grain', { exact: true }) })
      await expect(grainRow.locator('.scoring-cell-value')).toHaveText(['+1', '-1'])
      await expect(grainRow.locator('.scoring-cell-detail')).toHaveText([String(2 - scenario.pairs), '0'])
      await pad.screenshot({ path: testInfo.outputPath('final-scoring-pad.png') })
      const bonusRow = pad.locator(`[data-score-row="cardBonus-${CARD_ID}"]`)
      if (scenario.pairs === 0) await expect(bonusRow).toHaveCount(0)
      else {
        await bonusRow.scrollIntoViewIfNeeded()
        await expect(bonusRow).toBeInViewport()
        await expect(bonusRow.locator('.scoring-cell-value')).toHaveText(['+1', '0'])
        await pad.screenshot({ path: testInfo.outputPath('final-card-bonus.png') })
      }
    } finally {
      try { if (joined) await driver.newGame() }
      finally { await Promise.all(pages.map(page => page.close())) }
    }
  })
}
