// @covers client/components/board/FarmBoard.tsx
// @covers client/app/GameContainerApi.tsx
// @covers client/components/interaction/
// @covers client/utils/player-palisades.ts
// @covers shared/cards/D/D089_Stablehand.ts
import { expect, test, type Page } from '@playwright/test'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'
import { FRONTEND_URL } from './fixtures'
import { joinRoomClients, publicRoomState, roomDriver, roomSnapshot } from './room-command-driver'

test('Stablehand chooses a new farm after teammate fencing and preserves the free own stable across reload', async ({ browser, request }, testInfo) => {
  const pages: [Page, Page] = [await browser.newPage({ viewport: { width: 1280, height: 900 } }), await browser.newPage()]
  const [builder, teammate] = pages
  try {
    await joinRoomClients(pages, request)
    for (const [index, page] of pages.entries()) {
      await page.goto(`${FRONTEND_URL}/?player=p${index === 0 ? 1 : 3}&transport=ws&room=dev4&devMode=1`)
      await expect(page.locator('.game-layout')).toBeVisible({ timeout: 30000 })
      await expect.poll(() => page.evaluate(() => window.lifecycleUpdate?.payload.state.players.length)).toBe(4)
    }
    const driver = roomDriver(pages)
    const fixture = createWorkSession({ seed: 1631, options: { playerCount: 4, teamConfig: {
      mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'private', cooperationRules: true,
    } }, configure(state) {
      state.round = 14
      for (const player of state.players) {
        player.minorHand = ['__test_placeholder__']; player.occupationHand = ['__test_placeholder__']
        player.minorPlayed = []; player.occupationPlayed = []; player.improvements = []; player.cardStates = {}
        Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
      }
      state.players[0]!.name = 'Builder'; state.players[0]!.nameIsDefault = false
      state.players[2]!.name = 'Partner'; state.players[2]!.nameIsDefault = false
      state.players[0]!.occupationPlayed = ['D089_Stablehand']
      state.players[0]!.minorPlayed = ['B030_WoodPalisades']
      state.players[0]!.resources.wood = 6
    } })
    try { await driver.command(0, { type: 'loadGame', state: fixture.withCtx(() => serializeState(fixture.state, {})) }) }
    finally { fixture.dispose() }
    await driver.ui(0, () => builder.locator('[data-action-id="fencing"]').getByRole('button').first().click())
    await builder.getByRole('radio', { name: "Partner's farm", exact: true }).click()
    await driver.ui(0, () => builder.getByRole('button', { name: 'Build on this farm', exact: true }).click())
    await expect(builder.locator('.fence-mode-toggle')).toHaveCount(0)
    await expect(builder.locator('[data-fence-player="p1"].selectable')).toHaveCount(0)
    for (const edge of ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3']) {
      await builder.locator(`[data-fence-player="p3"][data-fence-edge="${edge}"] button`).click()
    }
    await expect(builder.getByTestId('fence-selection-cost')).toHaveText('Cost: 6 wood')
    await driver.ui(0, () => builder.getByRole('button', { name: 'Confirm fences', exact: true }).click())
    for (let step = 0; step < 3; step++) {
      const pending = (await roomSnapshot(builder)).interaction
      if (pending.stateId !== 'wait' || pending.request.kind !== 'choice'
        || pending.request.options.some(option => option.value.startsWith('target-farm:'))) break
      const accept = pending.request.options.find(option => option.value !== '__skip__')
      expect(accept).toBeDefined()
      await driver.ui(0, () => builder.locator(`button[data-choice-value="${accept!.value}"]`).click())
    }
    await expect(builder.getByRole('radio', { name: 'Your farm', exact: true })).toBeChecked()
    await expect(builder.getByRole('radio', { name: "Partner's farm", exact: true })).not.toBeChecked()
    await builder.screenshot({ path: testInfo.outputPath('fresh-stable-target.png'), fullPage: false })
    await driver.reload()
    await expect(builder.getByRole('radio', { name: 'Your farm', exact: true })).toBeChecked()
    await driver.ui(0, () => builder.getByRole('button', { name: 'Build on this farm', exact: true }).click())
    const tile = builder.locator('[data-farm-tile-player="p1"][data-farm-tile-key="0-4"].stable-selectable')
    await expect(tile).toBeVisible()
    await expect(builder.locator('[data-farm-tile-player="p3"].stable-selectable')).toHaveCount(0)
    await tile.click()
    await driver.ui(0, () => builder.getByRole('button', { name: 'Confirm stables', exact: true }).click())
    const completed = await roomSnapshot(builder)
    expect(publicRoomState(completed)).toEqual(publicRoomState(await roomSnapshot(teammate)))
    expect(completed.state.players[0]!.resources.wood).toBe(0)
    expect(completed.state.players[0]!.stableTiles).toEqual([{ row: 0, col: 4 }])
    expect(completed.state.players[0]!.pastures).toEqual([])
    expect(completed.state.players[2]!.stableTiles).toEqual([])
    expect(completed.state.players[2]!.pastures).toMatchObject([{ tiles: [{ row: 0, col: 2 }] }])
    expect(completed.state.log.filter(entry => entry.key === 'log.partnerFencesBuilt')).toHaveLength(1)
    expect(completed.state.log.some(entry => entry.key === 'log.partnerStablesBuilt')).toBe(false)
    await expect(builder.locator('.action-log__text').filter({ hasText: /Builder builds 4 fences for Partner/ })).toHaveCount(1)
    await builder.screenshot({ path: testInfo.outputPath('card-build-chain-completed.png'), fullPage: false })
    await testInfo.attach('authoritative-card-build-chain', { body: JSON.stringify(publicRoomState(completed)), contentType: 'application/json' })
  } finally { await Promise.all(pages.map(page => page.close())) }
})
