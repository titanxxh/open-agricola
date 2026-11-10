// @covers client/app/GameContainerApi.tsx
// @covers client/components/interaction/
// @covers server/connection/
// @covers shared/team/
import { expect, test, type Page } from '@playwright/test'
import type { GameSyncPayload } from '../shared/contract/protocol/game'
import { serializeState } from '../shared/session/serialization'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { FRONTEND_URL } from './fixtures'
import { joinRoomClients, publicRoomState, roomDriver, roomSnapshot } from './room-command-driver'

const variants = [
  { name: 'desktop-en', locale: 'en', width: 1280, height: 900 },
  { name: 'mobile-zh', locale: 'zh', width: 390, height: 844 },
] as const

function animalFixture(fireplace: boolean) {
  return createWorkSession({ seed: 1626, options: { playerCount: 4, teamConfig: {
    mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'private', cooperationRules: true,
  } }, configure(state) {
    state.currentPlayerIndex = 0
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      player.houseAnimals = {}
      player.stableAnimals = {}
      player.pastures = []
      Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0,
        food: 0, sheep: 0, boar: 0, cattle: 0 })
    }
    state.players[0]!.resources.sheep = 4
    state.players[0]!.pastures = [{ id: 'giver-pasture', size: 2, tiles: [{ row: 0, col: 2 }, { row: 0, col: 3 }],
      stables: 0, animalType: 'sheep', animalCount: 4 }]
    if (fireplace) state.players[2]!.improvements = ['Major_Fireplace1']
  } })
}

const assertSynchronized = async (pages: [Page, Page]): Promise<GameSyncPayload> => {
  const receiver = await roomSnapshot(pages[1])
  expect(publicRoomState(await roomSnapshot(pages[0]))).toEqual(publicRoomState(receiver))
  return receiver
}

for (const variant of variants) for (const outcome of ['discard', 'cook'] as const) {
  test(`Marketplace animal overflow belongs to the receiving seat and supports ${outcome} (${variant.name})`, async ({ browser, request }, testInfo) => {
    const viewport = { width: variant.width, height: variant.height }
    const options = { viewport, ...(variant.locale === 'zh' ? { isMobile: true, hasTouch: true } : {}) }
    const pages: [Page, Page] = [await browser.newPage(options), await browser.newPage(options)]
    const [giver, receiver] = pages
    const labels = variant.locale === 'en'
      ? { direction: 'Direction', quantity: 'Quantity', transfers: 'Confirm transfers', confirm: 'Confirm', discard: 'Confirm discard', switch: 'Confirm switch' }
      : { direction: '方向', quantity: '数量', transfers: '确认转移', confirm: '确认调整', discard: '确认丢弃', switch: '确认切换' }
    try {
      await joinRoomClients(pages, request, variant.locale)
      for (const [index, page] of pages.entries()) {
        await page.goto(`${FRONTEND_URL}/?player=p${index === 0 ? 1 : 3}&transport=ws&room=dev4&devMode=1`)
        await expect(page.locator('.game-layout')).toBeVisible({ timeout: 30000 })
        await expect.poll(() => page.evaluate(() => window.lifecycleUpdate?.payload.state.players.length)).toBe(4)
      }
      const driver = roomDriver(pages)
      const fixture = animalFixture(outcome === 'cook')
      try { await driver.command(0, { type: 'loadGame', state: fixture.withCtx(() => serializeState(fixture.state, {})) }) }
      finally { fixture.dispose() }
      await driver.ui(0, () => giver.locator('[data-action-id="marketplace"] button').first().click())
      const row = giver.locator('[data-marketplace-resource="sheep"]')
      await expect(row).toBeVisible()
      await row.getByRole('combobox', { name: labels.direction, exact: true }).selectOption('give')
      await row.getByRole('spinbutton', { name: labels.quantity, exact: true }).fill('2')
      await driver.ui(0, () => giver.locator('.marketplace-panel').getByRole('button', { name: labels.transfers, exact: true }).click())
      let current = await assertSynchronized(pages)
      expect(current.interaction).toMatchObject({ stateId: 'wait', playerIndex: 2, request: { kind: 'animal-reorg' } })
      expect(current.state.players[0]!.resources.sheep).toBe(1)
      expect(current.state.players[0]!.pastures[0]).toMatchObject({ animalCount: 1, animalType: 'sheep' })
      expect(current.state.players[2]!.resources.sheep).toBe(2)
      await expect(receiver.locator('.interaction-reorg-panel')).toBeVisible()
      await expect(giver.locator('.interaction-reorg-panel button:enabled')).toHaveCount(0)
      await driver.reload()
      current = await assertSynchronized(pages)
      expect(current.interaction).toMatchObject({ stateId: 'wait', playerIndex: 2, request: { kind: 'animal-reorg' } })
      expect(current.state.players[0]!.resources.sheep).toBe(1)
      expect(current.state.players[2]!.resources.sheep).toBe(2)
      if (outcome === 'cook') {
        await driver.ui(1, () => receiver.locator('[data-anytime-action-id="exchange"]').click())
        const recipe = receiver.locator('[data-testid^="anytime-exchange-option-Major_Fireplace1-ex"]')
          .filter({ has: receiver.locator('.res-icon-sheep') })
        await expect(recipe).toHaveCount(1)
        await recipe.getByRole('button', { name: '+', exact: true }).click()
        await driver.ui(1, () => receiver.locator('.exchange-confirm').click())
        current = await assertSynchronized(pages)
        expect(current.state.players[2]!.resources).toMatchObject({ sheep: 1, food: 2 })
        await driver.ui(1, () => receiver.locator('.interaction-reorg-panel').getByRole('button', { name: labels.confirm, exact: true }).click())
      } else {
        await receiver.locator('.interaction-reorg-panel').getByRole('button', { name: labels.confirm, exact: true }).click()
        await expect(receiver.locator('.interaction-reorg-warning')).toBeVisible()
        await receiver.screenshot({ path: testInfo.outputPath('receiver-discard-confirmation.png') })
        await driver.ui(1, () => receiver.locator('.interaction-reorg-panel').getByRole('button', { name: labels.discard, exact: true }).click())
      }
      current = await assertSynchronized(pages)
      expect(current.state.players[0]!.resources).toMatchObject({ sheep: 1, food: 0 })
      expect(current.state.players[2]!.resources).toMatchObject({ sheep: 1, food: outcome === 'cook' ? 2 : 0 })
      expect(Object.values(current.state.players[2]!.houseAnimals)).toEqual(['sheep'])
      expect(current.state.log.filter(entry => entry.key === 'log.marketplaceTransfer')).toHaveLength(1)
      const discards = current.state.events.filter(event => event.type === 'farm.animalDiscarded')
      expect(discards).toHaveLength(outcome === 'discard' ? 1 : 0)
      if (outcome === 'discard') expect(discards[0]).toMatchObject({ actorPlayerId: 'p3', animals: { sheep: 1 } })
      if (current.interaction.stateId === 'wait' && current.interaction.request.kind === 'confirm-player-switch') {
        await driver.ui(1, () => receiver.locator('.interaction-bar').getByRole('button', { name: labels.switch, exact: true }).click())
      }
      await expect(receiver.locator('.interaction-reorg-panel')).toHaveCount(0)
      await receiver.screenshot({ path: testInfo.outputPath(`receiver-${outcome}-complete.png`) })
      await testInfo.attach('animal-transfer-result', { contentType: 'application/json', body: JSON.stringify({
        state: publicRoomState(await roomSnapshot(receiver)), interaction: (await roomSnapshot(receiver)).interaction,
      }) })
    } finally { for (const page of pages) await page.context().close() }
  })
}
