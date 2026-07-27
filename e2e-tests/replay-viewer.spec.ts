import AxeBuilder from '@axe-core/playwright'
import { expect, test, type APIRequestContext } from '@playwright/test'

const backend = process.env.BACKEND_URL ?? 'http://localhost:5175'

const createReplay = async (request: APIRequestContext) => {
  const response = await request.post(`${backend}/api/test/replays/completed`)
  expect(response.status()).toBe(201)
  return await response.json() as {
    roomId: string
    firstStepHash: string
  }
}

test('anonymous completed replay supports perspectives, playback, layout, and anchors', async ({
  page,
  request,
}) => {
  const fixture = await createReplay(request)
  await page.goto(`/?context=${fixture.roomId}`)

  await expect(page.locator('iframe')).toHaveCount(0)
  const alicePerspective = page.getByRole('button', { name: /Alice/ })
  await expect(alicePerspective).toBeVisible()
  const accessibility = await new AxeBuilder({ page })
    .include('.replay-shell--chooser')
    .analyze()
  expect(accessibility.violations).toEqual([])
  await alicePerspective.click()

  const replay = page.frameLocator('iframe')
  await expect(replay.locator('.replay-app')).toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.get('layout')).toBe('timeline')
  await expect.poll(() => new URL(page.url()).searchParams.get('frame')).toMatch(/^[a-f0-9]{64}$/)
  await expect(replay.locator('[data-hand-anchor="p1"] .player-card-inner')).toHaveCount(14)
  await expect(replay.locator('[data-hand-anchor="p1"] .card-title').first()).not.toHaveText('')
  const cardFrameImage = await replay.locator('.card-frame').first().evaluate(
    (element) => getComputedStyle(element).backgroundImage,
  )
  expect(cardFrameImage).toContain('/replay-viewers/')
  expect(cardFrameImage).not.toContain('boardgamearena')

  await replay.locator('button[data-player="p2"]').click()
  await expect(replay.locator('[data-hand-anchor="p2"]')).toHaveCount(0)
  await replay.locator('.replay-header select').selectOption('open')
  await replay.locator('button[data-player="p2"]').click()
  await expect(replay.locator('[data-hand-anchor="p2"] .player-card-inner')).toHaveCount(14)

  await replay.locator('.replay-play').click()
  await expect(replay.locator('.replay-transport output')).toContainText('2 / 2', { timeout: 5000 })
  await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('2')
  await replay.locator('.replay-timeline button').first().click()
  await expect(replay.locator('.replay-transport output')).toContainText('0 / 2')

  await replay.locator('.replay-transport button').nth(2).click()
  await expect(replay.locator('.replay-transport output')).toContainText('1 / 2')
  await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('1')
  await expect.poll(() => new URL(page.url()).searchParams.get('frame')).toMatch(/^[a-f0-9]{64}$/)
  await replay.locator('.replay-header select').selectOption('p2')
  await expect(replay.getByText('当前视角不可见')).toBeVisible()

  await replay.locator('.replay-layout-toggle').click()
  await expect.poll(() => new URL(page.url()).searchParams.get('layout')).toBe('board')

  const anchor = await request.get(
    `${backend}/api/v1/replays/${fixture.roomId}/anchors/0?frame=${fixture.firstStepHash}`,
  )
  expect(anchor.status()).toBe(200)
  const mismatch = await request.get(
    `${backend}/api/v1/replays/${fixture.roomId}/anchors/0?frame=${'0'.repeat(64)}`,
  )
  expect(mismatch.status()).toBe(409)

  await page.goto(
    `/?context=${fixture.roomId}&step=0&frame=${fixture.firstStepHash}`,
  )
  await expect(page.getByRole('button', { name: /Alice/ })).toBeVisible()
  await page.goto(
    `/?context=${fixture.roomId}&step=0&frame=${'0'.repeat(64)}`,
  )
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(0)
})

test('mobile replay defaults to board first and preserves an explicit toggle', async ({
  page,
  request,
}) => {
  const fixture = await createReplay(request)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/?context=${fixture.roomId}`)
  await page.getByRole('button', { name: /Alice/ }).click()

  const replay = page.frameLocator('iframe')
  await expect(replay.locator('.replay-app--board')).toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.get('layout')).toBe('board')
  await replay.locator('.replay-layout-toggle').click()
  await expect(replay.locator('.replay-app--timeline')).toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.get('layout')).toBe('timeline')
})
