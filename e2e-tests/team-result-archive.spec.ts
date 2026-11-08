// @covers server/game/persistence/
// @covers replay-viewer/src/
// @covers client/app/GameContextRouter.tsx
// @covers client/app/ReplayShell.tsx
import { expect, test } from '@playwright/test'
import type { GameSyncPayload } from '../shared/contract/protocol/game'
import type { CompletedGameContextDescriptor } from '../shared/contract/protocol/game-context'
import { BACKEND_URL, getJson, postJson } from './fixtures'
import { authenticateSolo } from './helpers/standard-solo-acceptance'

for (const recordReplay of [false, true]) {
  test(`completed teams keep ranks and seat details (replay=${recordReplay})`, async ({ page, request }) => {
    await page.setViewportSize({ width: recordReplay ? 1440 : 390, height: 900 })
    await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
    expect((await postJson(request, `${BACKEND_URL}/api/game/new-sandbox`, { seed: 1601, playerCount: 4,
      teamConfig: { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'category-min', teammateVisibility: 'shared' },
    })).ok).toBe(true)
    const current: GameSyncPayload = await getJson(request, `${BACKEND_URL}/api/game/state`)
    current.state.players[0]!.resources.begging = 1
    for (const [index, player] of current.state.players.entries()) {
      player.name = ['Alice', 'Bob', 'Carol', 'Dave'][index]!
      player.nameIsDefault = false
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    const fixture = await postJson(request, `${BACKEND_URL}/api/test/replays/completed?recordReplay=${Number(recordReplay)}`, { state: current.state })
    expect(fixture.ok).toBe(true)
    const archived: CompletedGameContextDescriptor = await getJson(request, `${BACKEND_URL}/api/v1/game-contexts/${fixture.roomId}`)
    expect(archived.result.team).toMatchObject({ mode: 'team', scoring: 'category-min', scores: [
      { teamIndex: 0, rank: 2 }, { teamIndex: 1, rank: 1 },
    ] })

    await page.goto(`/?room=${fixture.roomId}`, { waitUntil: 'domcontentloaded' })
    const teams = page.locator('.archived-team-results > li')
    await expect(teams).toHaveCount(2)
    await expect(teams.first()).toHaveAttribute('data-team-index', '1')
    await expect(teams.first()).toContainText('Rank 1')
    await expect(teams.first()).toContainText('Bob')
    expect(await teams.first().evaluate(element => element.getBoundingClientRect().right <= window.innerWidth)).toBe(true)
    if (!recordReplay) {
      await expect(page.locator('iframe')).toHaveCount(0)
      return
    }
    const manifest = await getJson(request, `${BACKEND_URL}/api/v1/replays/${fixture.roomId}/manifest`)
    expect(manifest.team).toEqual(archived.result.team)
    await page.getByRole('button', { name: 'Replay as Bob', exact: true }).click()
    const replay = page.frameLocator('iframe')
    await replay.locator('.replay-play').click()
    await expect(replay.locator('.team-score')).toHaveCount(2)
    const team = replay.locator('.team-score[data-team-index="0"]')
    await team.getByText('Seat details', { exact: true }).click()
    await expect(team.locator('[data-team-counted="true"]').first()).toBeVisible()
    await page.screenshot({ path: 'output/playwright/team-result-archive-replay.png', fullPage: true })
  })
}

test('a multihand account sees its completed game once in personal history', async ({ browser, request }) => {
  const context = await browser.newContext()
  try {
    await authenticateSolo(context, request, `archive_${Date.now().toString(36)}`)
    expect((await postJson(request, `${BACKEND_URL}/api/game/new-sandbox`, { seed: 1601, playerCount: 4,
      teamConfig: { mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'sum' },
    })).ok).toBe(true)
    const current: GameSyncPayload = await getJson(request, `${BACKEND_URL}/api/game/state`)
    const fixture = await postJson(request, `${BACKEND_URL}/api/test/replays/completed?recordReplay=0`, { state: current.state })
    expect(fixture.ok).toBe(true)
    expect(fixture.ownedPlayerIndexes).toEqual([0, 2])
    const archived: CompletedGameContextDescriptor = await getJson(request, `${BACKEND_URL}/api/v1/game-contexts/${fixture.roomId}`)
    expect(archived.result.players.map(player => player.teamIndex)).toEqual([0, 1, 0, 1])
    expect(archived.result.team?.mode).toBe('multihand')
    const ended = await getJson(request, `${BACKEND_URL}/api/lobby/ended-games`)
    expect(ended.ok).toBe(true)
    expect(ended.games.filter((game: { id: string }) => game.id === fixture.roomId)).toHaveLength(1)
  } finally { await context.close() }
})
