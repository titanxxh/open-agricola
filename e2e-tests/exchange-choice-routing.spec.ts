// @covers client/app/
// @covers client/components/interaction/
import { expect, test, type Page } from '@playwright/test'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeSessionSnapshot } from '../shared/session/serialization'
import { markAllWorkersUsed } from '../shared/domain/player'
import { emptyResources } from '../shared/contract/state-constants'
import { joinRoomClients, roomDriver, roomSnapshot } from './room-command-driver'

const gardenDesigner = 'C099_GardenDesigner'
const butchersBlock = 'M101_ButchersBlock'

const scoringSnapshot = () => {
  const session = createWorkSession({ seed: 5099, configure: state => {
    state.round = 14
    for (const space of state.actionSpaces) space.takenBy = []
    for (const player of state.players) {
      player.resources = { ...emptyResources, food: 4 }
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      player.fields = []
      player.pastures = []
      markAllWorkersUsed(state, player)
      for (const worker of player.workers) {
        if (worker.isActive) state.actionSpaces[0]!.takenBy.push({ playerId: player.id, workerId: worker.id })
      }
    }
    state.players[0]!.occupationPlayed = [gardenDesigner]
    state.players[0]!.resources.food = 5
    state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] }]
  } })
  try {
    let response = session.performRoundEnd()
    for (let step = 0; step < 20; step++) {
      expect(response.ok, response.error).toBe(true)
      const interaction = response.interaction
      if (interaction.stateId !== 'wait') throw new Error('Expected final harvest or scoring choice')
      if (interaction.sourceCard === gardenDesigner && interaction.request.kind === 'choice') {
        expect(interaction.request.options.map(option => option.value)).toEqual([
          `${gardenDesigner}:food:0:score:0`, `${gardenDesigner}:food:1:score:1`,
        ])
        return serializeSessionSnapshot(session.state, session)
      }
      const { playerIndex, request } = interaction
      if (request.kind === 'feed') response = session.resolveChoice(playerIndex, 'confirm', { selections: [] })
      else if (request.kind === 'confirm-next-player' || request.kind === 'confirm-player-switch') {
        response = session.resolveChoice(playerIndex, 'confirm')
      } else if (request.options?.some(option => option.value === '__skip__')) {
        response = session.resolveChoice(playerIndex, '__skip__')
      } else throw new Error(`Unexpected harvest request: ${request.kind}`)
    }
    throw new Error('Did not reach Garden Designer scoring')
  } finally { session.dispose() }
}

for (const food of [0, 1]) {
  test(`restored Garden Designer choice spends ${food} food and finishes on both clients`, async ({ browser, request }, testInfo) => {
    const pages: [Page, Page] = [await browser.newPage(), await browser.newPage()]
    const driver = roomDriver(pages)
    let joined = false
    try {
      await joinRoomClients(pages, request)
      joined = true
      await pages[0].setViewportSize({ width: 390, height: 844 })
      await driver.command(0, { type: 'loadGame', state: scoringSnapshot() })
      await driver.reload()
      const page = pages[0]
      await expect(page.locator('.exchange-overlay')).toHaveCount(0)
      const zero = page.locator(`[data-choice-value="${gardenDesigner}:food:0:score:0"]`)
      await expect(zero).toBeVisible()
      await expect(zero).toContainText('Free')
      await expect(zero.getByRole('img', { name: '0 Bonus VP', exact: true })).toBeVisible()
      const chosen = page.locator(`[data-choice-value="${gardenDesigner}:food:${food}:score:${food}"]`)
      await expect(chosen).toBeEnabled()
      await expect(chosen).toBeInViewport()
      await page.screenshot({ path: testInfo.outputPath(`garden-designer-${food}-choice.png`) })
      await driver.ui(0, () => chosen.click())
      for (const client of pages) {
        const finished = await roomSnapshot(client)
        expect(finished.state.gameOver).toBe(true)
        expect(finished.state.players[0]!.resources.food).toBe(1 - food)
        const entries = finished.scores?.[0]?.categories.find(category => category.key === 'cardBonusVp')?.entries ?? []
        expect(entries.find(entry => entry.type === 'bonus' && entry.cardId === gardenDesigner)?.score ?? 0).toBe(food)
        expect(finished.state.log.filter(entry => entry.key === 'log.gameOver')).toHaveLength(1)
        expect(finished.state.log.filter(entry => entry.key === 'log.cardEffectPay' && entry.params?.cardId === gardenDesigner)).toHaveLength(food)
      }
    } finally {
      try { if (joined) await driver.newGame() }
      finally { await Promise.all(pages.map(page => page.close())) }
    }
  })
}

test('Butcher’s Block keeps owner skip and another player’s conversion in the choice bar', async ({ browser, request }) => {
  const pages: [Page, Page] = [await browser.newPage(), await browser.newPage()]
  const driver = roomDriver(pages)
  let joined = false
  try {
    await joinRoomClients(pages, request)
    joined = true
    const session = createWorkSession({ seed: 101, options: {
      enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true,
    }, configure: state => {
      state.round = 5
      for (const space of state.actionSpaces) space.takenBy = []
      for (const [index, player] of state.players.entries()) {
        player.resources = { ...emptyResources, wood: index === 0 ? 1 : 0, sheep: index === 0 ? 1 : 0,
          boar: index === 1 ? 1 : 0, cattle: index === 1 ? 1 : 0 }
        player.minorHand = index === 0 ? [butchersBlock] : ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.minorPlayed = []
        player.occupationPlayed = []
        player.improvements = []
        player.cardStates = {}
      }
    } })
    try { await driver.command(0, { type: 'loadGame', state: serializeSessionSnapshot(session.state, session) }) }
    finally { session.dispose() }
    await driver.command(0, { type: 'action', spaceId: 'meeting-place' })
    for (let step = 0; step < 6; step++) {
      const { interaction } = await roomSnapshot(pages[0])
      if (interaction.stateId !== 'wait' || interaction.request.kind !== 'choice') throw new Error('Expected improvement choice')
      if (interaction.sourceCard === butchersBlock && interaction.promptKey === 'ui.interactionExchangeChoice') break
      const options = interaction.request.options
      const selected = options.find(option => option.value === butchersBlock)
        ?? options.find(option => option.value.startsWith('action-improvement-'))
        ?? (interaction.promptKey === 'prompt.selectPayment' ? options[0] : undefined)
      if (!selected) throw new Error('Missing Butcher’s Block purchase option')
      await driver.command(0, { type: 'choice', value: selected.value })
    }
    await expect(pages[0].locator('.exchange-overlay')).toHaveCount(0)
    await driver.ui(0, () => pages[0].locator('[data-choice-value="__skip__"]').click())
    await driver.command(0, { type: 'choice', value: 'confirm' })
    const { interaction } = await roomSnapshot(pages[1])
    if (interaction.stateId !== 'wait' || interaction.request.kind !== 'choice') throw new Error('Expected other player conversion')
    const boar = interaction.request.options.find(option => option.effectPreview?.kind === 'resourceExchange'
      && option.effectPreview.resourcesPaid?.boar === 1)
    if (!boar) throw new Error('Missing boar conversion')
    await expect(pages[1].locator('.exchange-overlay')).toHaveCount(0)
    await expect(pages[1].locator('[data-choice-value="__skip__"]')).toHaveCount(0)
    await driver.ui(1, () => pages[1].locator(`[data-choice-value="${boar.value}"]`).click())
    for (let step = 0; step < 8; step++) {
      const current = (await roomSnapshot(pages[0])).interaction
      if (current.stateId === 'idle') break
      if (current.stateId !== 'wait') throw new Error('Expected conversion continuation')
      const own = (await roomSnapshot(pages[current.playerIndex]!)).interaction
      if (own.stateId !== 'wait') throw new Error('Expected responding player')
      if (own.request.kind === 'animal-reorg') {
        await driver.command(own.playerIndex, { type: 'choice', value: 'confirm', payload: { zones: own.request.zones } })
      } else if (own.request.kind === 'confirm-next-player' || own.request.kind === 'confirm-player-switch') {
        await driver.command(own.playerIndex, { type: 'choice', value: 'confirm' })
      } else throw new Error(`Unexpected continuation: ${own.request.kind}`)
    }
    for (const page of pages) {
      const result = await roomSnapshot(page)
      expect(result.interaction.stateId).toBe('idle')
      expect(result.state.players[0]!.resources).toMatchObject({ sheep: 1, food: 0 })
      expect(result.state.players[1]!.resources).toMatchObject({ boar: 0, cattle: 1, food: 2 })
    }
  } finally {
    try { if (joined) await driver.newGame() }
    finally { await Promise.all(pages.map(page => page.close())) }
  }
})
