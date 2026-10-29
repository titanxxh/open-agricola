import { expect, test } from '@playwright/test'
import type { MyActiveRoom } from '../shared/contract/lobby'

test.use({ timezoneId: 'Asia/Singapore' })

for (const width of [320, 1280]) {
  for (const locale of ['en']) {
    test(`active games show six colored players and update turns at ${width}px in ${locale}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 })
      await page.clock.install()
      await page.addInitScript(locale => localStorage.setItem('open-agricola-locale-v2', locale), locale)
      const colors: MyActiveRoom['players'][number]['color'][] = ['red', 'blue', 'yellow', 'black', 'green', 'purple']
      const names = ['Alice', 'LongUnbrokenPlayerName'.repeat(3), '农场玩家张三', 'José', '🌾 Farmer', '玩家六']
      const room: MyActiveRoom = {
        id: '96725f41-b719-4474-a3df-90e5d239108b', status: 'playing', max_players: 6,
        player_index: 0, my_turn: 0, current_player_index: 1,
        created_at: Date.UTC(2026, 9, 27, 8), started_at: Date.UTC(2026, 9, 27, 8, 30), updated_at: Date.UTC(2026, 9, 27, 8, 40),
        players: colors.map((color, playerIndex) => ({ playerIndex, name: names[playerIndex]!, color })),
      }
      await page.route('**/api/**', route => {
        const path = new URL(route.request().url()).pathname
        return route.fulfill({ json: path === '/api/auth/me'
          ? { ok: true, user: { id: 'alice', username: 'alice', displayName: 'Alice' } }
          : { ok: true, rooms: path === '/api/lobby/my-rooms' ? [room] : [] } })
      })
      await page.goto('/?page=lobby')
      const game = page.locator('.my-game')
      await expect(game.locator('.my-game__name')).toHaveText(names)
      await expect(game).not.toContainText(room.id)
      await expect(game.locator('time')).toHaveAttribute('datetime', '2026-10-27T08:30:00.000Z')
      await expect(game.locator('.my-game__turn')).toContainText(names[1]!)
      for (const color of colors) await expect(game.locator(`.my-game__color[data-player-color=${color}]`)).toBeVisible()
      const resume = game.getByRole('button', { name: 'Resume' })
      await expect(resume).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await game.screenshot({ path: testInfo.outputPath('six-player-game.png') })

      room.current_player_index = 0
      room.my_turn = 1
      await page.clock.fastForward(5_100)
      await expect(game.locator('.my-game__turn')).toHaveAttribute('data-my-turn', 'true')
      await expect(game.locator('.my-game__turn')).toHaveText('Your turn')
      await page.reload()
      await expect(game.locator('.my-game__name')).toHaveText(names)
      await expect(game.locator('.my-game__turn')).toHaveAttribute('data-my-turn', 'true')
    })
  }
}
