import { expect, test } from '@playwright/test'

test('shows recovery controls when the game chunk still fails after one reload', async ({ page }) => {
  let blockedRequests = 0
  await page.route('**/api/lobby/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, rooms: [] }),
    }),
  )
  await page.route(/GameContainerApi.*\.(?:tsx|js)/, route => {
    blockedRequests += 1
    return route.abort('failed')
  })

  await page.goto('/?page=lobby&player=p1&devMode=1')
  await page.evaluate(() => {
    sessionStorage.setItem('open-agricola:stale-chunk-reload-at', String(Date.now()))
  })
  await page.getByRole('button', { name: /创建多人游戏|Create Multiplayer Game/i }).click()
  await page.getByRole('button', { name: /创建游戏|Create Game/i }).click()

  await expect(page).toHaveURL(/page=game/)
  await expect(page.getByRole('alert')).toContainText(/页面加载失败|Page failed to load/)
  await expect(page.getByRole('button', { name: /重试|Retry/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /返回大厅|Back to Lobby/i })).toBeVisible()
  expect(new URL(page.url()).searchParams.get('room')).toBeNull()
  expect(blockedRequests).toBe(1)
})
