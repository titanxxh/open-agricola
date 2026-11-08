// @covers server/game/persistence/
// @covers replay-viewer/src/
// @covers client/app/GameContextRouter.tsx
// @covers client/app/ReplayShell.tsx
// @covers client/styles/pages/replay.css
import { expect, test } from '@playwright/test'
import type { GameSyncPayload } from '../shared/contract/protocol/game'
import type { CompletedGameContextDescriptor } from '../shared/contract/protocol/game-context'
import { BACKEND_URL, getJson, postJson } from './fixtures'
import { authenticateSolo } from './helpers/standard-solo-acceptance'

const contrastRatio = (foreground: string, background: string) => {
  const luminance = (color: string) => {
    const [red = 0, green = 0, blue = 0] = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(channel => {
      const value = Number(channel) / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    return red * 0.2126 + green * 0.7152 + blue * 0.0722
  }
  const first = luminance(foreground), second = luminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

for (const recordReplay of [false, true]) {
  test(`completed teams keep ranks and seat details (replay=${recordReplay})`, async ({ page, request }) => {
    // Default-general availability still requires a registered account for team creation.
    await authenticateSolo(page.context(), request, `team_archive_${Date.now().toString(36)}`)
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

    // Keep archive and replay rendering anonymous; only fixture creation needs the account.
    await page.context().clearCookies()
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
    const colors = await team.evaluate(element => ({ foreground: getComputedStyle(element).color,
      background: getComputedStyle(element.closest('.scoring-pad')!).backgroundColor }))
    expect(contrastRatio(colors.foreground, colors.background)).toBeGreaterThanOrEqual(4.5)
    await team.getByText('Seat details', { exact: true }).click()
    await expect(team.locator('[data-team-counted="true"]').first()).toBeVisible()
    await page.screenshot({ path: 'output/playwright/team-result-archive-replay.png', fullPage: true })
  })
}

test('a qualified team participant can reach replay controls with the rematch block visible', async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await authenticateSolo(page.context(), request, `team_viewer_${Date.now().toString(36)}`)
  const account = await getJson(request, `${BACKEND_URL}/api/auth/me`)
  expect(account.user.experimentalFeatures).toContain('team-modes')
  expect((await postJson(request, `${BACKEND_URL}/api/game/new-sandbox`, { seed: 1601, playerCount: 4,
    teamConfig: { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'category-min', teammateVisibility: 'shared' },
  })).ok).toBe(true)
  const current: GameSyncPayload = await getJson(request, `${BACKEND_URL}/api/game/state`)
  for (const [index, player] of current.state.players.entries()) { player.name = `Viewer ${index}`; player.nameIsDefault = false }
  const fixture = await postJson(request, `${BACKEND_URL}/api/test/replays/completed?recordReplay=1`, { state: current.state })
  expect(fixture.ok).toBe(true)
  await page.goto(`/?room=${fixture.roomId}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Play again with these settings', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Replay as Viewer 0', exact: true }).click()
  const frame = page.locator('iframe')
  await expect(frame).toBeVisible()
  const replay = page.frameLocator('iframe')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    const bounds = await frame.boundingBox()
    if (!bounds) throw new Error('Expected the replay frame to occupy the remaining viewport')
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(900)
    await expect(replay.locator('.replay-play')).toBeInViewport()
    await page.screenshot({ path: testInfo.outputPath(`completed-team-replay-${width}.png`), fullPage: true })
  }
  await replay.locator('.replay-play').click()
  await expect(replay.locator('.team-score')).toHaveCount(2)
})

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
