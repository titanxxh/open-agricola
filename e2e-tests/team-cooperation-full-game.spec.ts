// @covers client/app/GameContainerApi.tsx
// @covers client/services/gameTransport.ts
// @covers client/components/board/FarmBoard.tsx
// @covers client/components/interaction/
// @covers server/game/authoritative-session.ts
// @covers server/connection/room-router.ts
import { expect, test, type Page } from '@playwright/test'
import type { GameSyncPayload } from '../shared/contract/protocol/game'
import type { ClientCommand } from '../shared/contract/protocol/ws'
import { serializeState } from '../shared/session/serialization'
import { cooperationFullGameFixture } from './helpers/cooperation-full-game'
import { joinRoomClients, publicRoomState, roomDriver, roomSnapshot } from './room-command-driver'

type RoomDriver = ReturnType<typeof roomDriver>

const publicGame = (payload: GameSyncPayload) => ({
  ...publicRoomState(payload),
  currentPlayerIndex: payload.state.currentPlayerIndex,
  farms: payload.state.players.map(player => ({
    id: player.id, rooms: player.rooms, roomTiles: player.roomTiles,
    houseType: player.houseType, workers: player.workers,
  })),
})

async function loadInitialGame(driver: RoomDriver) {
  const fixture = cooperationFullGameFixture()
  try { await driver.command(0, { type: 'loadGame', state: fixture.withCtx(() => serializeState(fixture.state, {})) }) }
  finally { fixture.dispose() }
}

async function synchronized(pages: readonly Page[]) {
  const payload = await roomSnapshot(pages[0]!)
  for (const page of pages.slice(1)) expect(publicGame(await roomSnapshot(page))).toEqual(publicGame(payload))
  return payload
}

async function confirmHandoff(pages: readonly Page[], driver: RoomDriver) {
  const interaction = (await roomSnapshot(pages[0]!)).interaction
  expect(interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  if (interaction.stateId !== 'wait' || interaction.request.kind !== 'confirm-next-player') throw new Error('Expected the next player handoff')
  await driver.command(interaction.playerIndex, { type: 'choice', value: 'confirm' })
}

async function filler(pages: readonly Page[], driver: RoomDriver, playerIndex: number, spaceId: string) {
  expect((await roomSnapshot(pages[playerIndex]!)).state.currentPlayerIndex).toBe(playerIndex)
  await driver.command(playerIndex, { type: 'action', spaceId })
  await confirmHandoff(pages, driver)
}

const category = (payload: GameSyncPayload, playerId: string, key: string) =>
  payload.scores?.find(score => score.playerId === playerId)?.categories.find(category => category.key === key)?.total

test('four connected team seats trade and build for a partner, harvest, and continue the next round', async ({ browser, request }, testInfo) => {
  const pages = await Promise.all([0, 1, 2, 3].map(() => browser.newPage({ viewport: { width: 1440, height: 1000 } })))
  const builder = pages[0]!
  try {
    await joinRoomClients(pages, request, 'en', 'dev4')
    const driver = roomDriver(pages)
    await loadInitialGame(driver)
    const initial = await synchronized(pages)
    expect(initial.state.team?.playerTeams).toEqual([0, 1, 0, 1])
    expect(initial.state.players.map(player => player.workers.filter(worker => worker.isActive).length)).toEqual([3, 2, 2, 2])

    await driver.ui(0, () => builder.locator('[data-action-id="marketplace"]').getByRole('button').first().click())
    await expect(builder.locator('[data-marketplace-resource="wood"]')).toBeVisible()
    const wood = builder.locator('[data-marketplace-resource="wood"]')
    await wood.getByRole('combobox', { name: 'Direction', exact: true }).selectOption('give')
    await wood.getByRole('combobox', { name: 'Teammate', exact: true }).selectOption('p3')
    await wood.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('2')
    await driver.ui(0, () => builder.getByRole('button', { name: 'Confirm transfers', exact: true }).click())
    const traded = await synchronized(pages)
    expect(traded.state.players.map(player => player.resources.wood)).toEqual([27, 0, 2, 0])
    expect(traded.state.players[0]!.stats.resourcesFromCards.wood ?? 0).toBe(0)
    expect(traded.state.players[2]!.stats.resourcesFromCards.wood ?? 0).toBe(0)
    expect(traded.state.log.filter(entry => entry.key === 'log.marketplaceTransfer')).toHaveLength(1)
    await confirmHandoff(pages, driver)
    await filler(pages, driver, 1, 'grain-seeds')
    await filler(pages, driver, 2, 'day-laborer')
    await filler(pages, driver, 3, 'vegetable-seeds')

    await driver.ui(0, () => builder.locator('[data-action-id="farm-expansion"]').getByRole('button').first().click())
    await builder.getByRole('radio', { name: "Partner's farm", exact: true }).click()
    await driver.ui(0, () => builder.getByRole('button', { name: 'Build on this farm', exact: true }).click())
    await driver.ui(0, () => builder.locator('button[data-choice-value]').filter({ hasText: 'Build Rooms' }).click())
    expect((await roomSnapshot(builder)).interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select', farmOwnerPlayerId: 'p3' } })
    await expect(builder.locator('[data-farm-tile-player="p1"].selectable')).toHaveCount(0)
    await builder.locator('[data-farm-tile-player="p3"][data-farm-tile-key="1-1"].selectable').click()
    await builder.screenshot({ path: testInfo.outputPath('partner-room-before-confirm.png'), fullPage: false })
    await driver.ui(0, () => builder.getByRole('button', { name: 'Confirm expansion', exact: true }).click())
    const room = await synchronized(pages)
    expect(room.state.players[0]!.resources).toMatchObject({ wood: 27, clay: 0, reed: 0 })
    expect(room.state.players[2]!).toMatchObject({ rooms: 3, houseType: 'clay' })
    expect(category(room, 'p3', 'clayRooms')).toBe(3)
    await driver.ui(0, () => builder.locator('button[data-choice-value]').filter({ hasText: 'Stables' }).click())
    await expect(builder.getByRole('radio', { name: 'Your farm', exact: true })).toHaveCount(0)
    expect((await roomSnapshot(builder)).interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select', farmOwnerPlayerId: 'p3' } })
    await builder.locator('[data-farm-tile-player="p3"][data-farm-tile-key="0-2"].stable-selectable').click()
    await driver.ui(0, () => builder.getByRole('button', { name: 'Confirm stables', exact: true }).click())
    const stable = await synchronized(pages)
    expect(stable.state.players[0]!.resources).toMatchObject({ wood: 24, clay: 0, reed: 0 })
    expect(stable.state.players[2]!.resources).toMatchObject({ wood: 2, clay: 0, reed: 0 })
    expect(stable.state.players[2]!.stableTiles).toEqual([{ row: 0, col: 2 }])
    await confirmHandoff(pages, driver)
    await filler(pages, driver, 1, 'reed-bank')
    await filler(pages, driver, 2, 'clay-pit')
    await filler(pages, driver, 3, 'forest')

    await driver.ui(0, () => builder.locator('[data-action-id="fencing"]').getByRole('button').first().click())
    await builder.getByRole('radio', { name: "Partner's farm", exact: true }).click()
    await driver.ui(0, () => builder.getByRole('button', { name: 'Build on this farm', exact: true }).click())
    await expect(builder.locator('[data-fence-player="p1"].selectable')).toHaveCount(0)
    for (const edge of ['H-0-3', 'H-1-3', 'V-0-3', 'V-0-4']) {
      await builder.locator(`[data-fence-player="p3"][data-fence-edge="${edge}"] button`).click()
    }
    await expect(builder.getByTestId('fence-selection-cost')).toHaveText('Cost: 6 wood')
    await builder.screenshot({ path: testInfo.outputPath('partner-fences-before-confirm.png'), fullPage: false })
    await driver.ui(0, () => builder.getByRole('button', { name: 'Confirm fences', exact: true }).click())
    const fenced = await synchronized(pages)
    expect(fenced.state.players[0]!.resources.wood).toBe(18)
    expect(fenced.state.players[0]!.roomTiles).toEqual(initial.state.players[0]!.roomTiles)
    expect(fenced.state.players[0]!.stableTiles).toEqual([])
    expect(fenced.state.players[0]!.pastures).toEqual([])
    expect(fenced.state.players[2]!.fenceSegments).toHaveLength(4)
    expect(fenced.state.players[2]!.pastures).toMatchObject([{ tiles: [{ row: 0, col: 3 }] }])
    expect(category(fenced, 'p3', 'pastures')).toBe(1)
    expect(category(fenced, 'p3', 'empty')).toBe(-10)
    expect(category(fenced, 'p1', 'empty')).toBe(-12)
    for (const key of ['log.marketplaceTransfer', 'log.partnerRoomsBuiltClay', 'log.partnerStablesBuilt', 'log.partnerFencesBuilt']) {
      expect(fenced.state.log.filter(entry => entry.key === key)).toHaveLength(1)
    }
    await builder.screenshot({ path: testInfo.outputPath('four-seat-cooperation-completed.png'), fullPage: false })

    // The last worker's normal handoff runs harvest and feeding with sufficient food.
    await confirmHandoff(pages, driver)
    const nextRound = await synchronized(pages)
    expect(nextRound.state).toMatchObject({ round: 14, roundPhase: 'work', currentPlayerIndex: 0 })
    expect(nextRound.state.players.map(player => player.resources.food)).toEqual([14, 16, 18, 16])
    expect(nextRound.interaction).toMatchObject({ stateId: 'idle' })
    await driver.ui(0, () => builder.locator('[data-action-id="forest"]').getByRole('button').first().click())
    const continued = await synchronized(pages)
    expect(continued.state.players[0]!.resources.wood).toBe(21)
    expect(continued.state.players[1]!.resources).toMatchObject({ reed: 1, grain: 1, food: 16 })
    expect(continued.state.players[2]!.resources).toMatchObject({ wood: 2, clay: 1, food: 18 })
    expect(continued.state.players[3]!.resources).toMatchObject({ wood: 1, vegetable: 1, food: 16 })
    await confirmHandoff(pages, driver)
    expect((await roomSnapshot(builder)).state.currentPlayerIndex).toBe(1)
    await builder.screenshot({ path: testInfo.outputPath('next-round-real-action.png'), fullPage: false })
    await testInfo.attach('four-seat-cooperation-authority', { body: JSON.stringify(publicGame(await synchronized(pages))), contentType: 'application/json' })
  } finally { await Promise.all(pages.map(page => page.close())) }
})

test('a retained client without cooperation capability sees a readable refresh prompt and can reload with the current client', async ({ browser, request }, testInfo) => {
  const pages = await Promise.all([0, 1, 2, 3].map(() => browser.newPage()))
  const stale = pages[0]!
  try {
    await joinRoomClients(pages, request, 'en', 'dev4')
    const driver = roomDriver(pages)
    await loadInitialGame(driver)
    const before = publicGame(await synchronized(pages))
    const version = await pages[1]!.evaluate(() => window.lifecycleUpdate?.version)
    await stale.addInitScript(() => {
      const send = WebSocket.prototype.send
      WebSocket.prototype.send = function (data) {
        if (typeof data === 'string' && sessionStorage.getItem('cooperation-client-updated') !== 'true') {
          const command: ClientCommand = JSON.parse(data)
          if (command.type === 'getCommandScope') {
            delete command.clientCapabilities
            return send.call(this, JSON.stringify(command))
          }
        }
        return send.call(this, data)
      }
    })
    await stale.reload()
    await expect(stale.getByRole('alert')).toHaveText('Error: Please refresh this page to use official cooperation rules.')
    await expect(stale.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
    await expect(stale.locator('.game-layout')).toHaveCount(0)
    expect(publicGame(await roomSnapshot(pages[1]!))).toEqual(before)
    expect(await pages[1]!.evaluate(() => window.lifecycleUpdate?.version)).toBe(version)
    await stale.screenshot({ path: testInfo.outputPath('old-client-refresh-required.png'), fullPage: false })
    await stale.evaluate(() => sessionStorage.setItem('cooperation-client-updated', 'true'))
    await stale.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(stale.locator('.game-layout')).toBeVisible({ timeout: 30000 })
    expect(publicGame(await synchronized(pages))).toEqual(before)
    await driver.ui(0, () => stale.locator('[data-action-id="marketplace"]').getByRole('button').first().click())
    await expect(stale.locator('[data-marketplace-resource="wood"]')).toBeVisible()
    expect((await roomSnapshot(stale)).interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'marketplace-select' } })
    await stale.screenshot({ path: testInfo.outputPath('updated-client-cooperation-resumed.png'), fullPage: false })
  } finally { await Promise.all(pages.map(page => page.close())) }
})
