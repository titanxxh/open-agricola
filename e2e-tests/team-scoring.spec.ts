// @covers client/components/board/
import { expect, test } from '@playwright/test'
import type { GameSyncPayload } from '../shared/contract/protocol/game'
import { BACKEND_URL, getJson, postJson } from './fixtures'

for (const scoring of ['category-min', 'product'] as const) {
  test(`team scoring shows ranks and ${scoring} calculations`, async ({ page, request }) => {
    await page.setViewportSize({ width: scoring === 'category-min' ? 390 : 1440, height: 900 })
    await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
    const created = await postJson(request, `${BACKEND_URL}/api/game/new-sandbox`, {
      seed: 42, playerCount: 4, teamConfig: { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring, teammateVisibility: 'shared' },
    })
    expect(created.ok).toBe(true)
    const current: GameSyncPayload = await getJson(request, `${BACKEND_URL}/api/game/state`)
    expect(current.state.team?.playerTeams).toEqual([0, 1, 0, 1])
    current.state.gameOver = true
    for (const player of current.state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    expect((await postJson(request, `${BACKEND_URL}/api/game/load`, { state: current.state })).ok).toBe(true)
    await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
    await expect(page.locator('.team-score')).toHaveCount(2)
    const team = page.locator('[data-team-index="0"]')
    await expect(team.getByText('Rank 1', { exact: true })).toBeVisible()
    await expect(team.locator('[data-team-total]')).toHaveText(scoring === 'product' ? '0' : '-14')
    expect(await team.evaluate(element => element.getBoundingClientRect().right <= window.innerWidth)).toBe(true)
    await team.getByText('Seat details', { exact: true }).click()
    await expect(team.locator('.team-score-table')).toBeVisible()
    if (scoring === 'category-min') expect(await team.locator('[data-team-counted="true"]').count()).toBeGreaterThan(0)
    else {
      await expect(team.locator('[data-team-factor]')).toHaveCount(2)
      await expect(team.locator('[data-team-factor]').first()).toContainText('-14 → 0')
    }
    await page.locator('.scoring-pad').screenshot({ path: `output/playwright/team-scoring-${scoring}.png` })
  })
}
