// @covers client/components/board/
// @covers client/app/
import { expect, test } from '@playwright/test'
import type { GameSyncPayload } from '../shared/contract/protocol/game'
import { BACKEND_URL, getJson, postJson } from './fixtures'

for (const [locale, labels] of [
  ['zh', { uses: '剩余 3 次', trades: '已兑换 1 次' }],
  ['en', { uses: '3 uses left', trades: '1 trades made' }],
] as const) {
  test(`${locale} labels classic card counters instead of showing raw keys`, async ({ page, request }) => {
    await page.addInitScript(value => localStorage.setItem('open-agricola-locale-v2', value), locale)
    expect((await postJson(request, `${BACKEND_URL}/api/game/new-sandbox`, {
      seed: 62, playerCount: 2, customCardIds: [],
    })).ok).toBe(true)
    const { state }: GameSyncPayload = await getJson(request, `${BACKEND_URL}/api/game/state`)
    for (const player of state.players) {
      player.occupationHand = ['__test_placeholder__']
      player.minorHand = ['__test_placeholder__']
    }
    const owner = state.players[0]!
    owner.occupationPlayed = ['CWM023_ForestFarmer']
    owner.minorPlayed = ['CFL007_DiamondTradingPost']
    owner.cardStates = {
      ...owner.cardStates,
      CWM023_ForestFarmer: { counters: { uses: 3 } },
      CFL007_DiamondTradingPost: { counters: { stone: 2, trades: 1 } },
    }
    expect((await postJson(request, `${BACKEND_URL}/api/game/load`, { state })).ok).toBe(true)
    await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
    await expect(page.locator('.game-layout')).toBeVisible()

    const counters = page.locator('.card-future-item')
    await expect(counters.filter({ hasText: labels.uses })).toHaveCount(1)
    await expect(counters.filter({ hasText: labels.trades })).toHaveCount(1)
    await expect(page.locator('.resource-chip.resource-stone .resource-chip-count').filter({ hasText: '2' })).toHaveCount(1)
    await expect(page.locator('.game-layout')).not.toContainText('resources.')
  })
}
