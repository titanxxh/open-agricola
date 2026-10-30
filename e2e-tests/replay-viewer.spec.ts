import AxeBuilder from '@axe-core/playwright'
import { expect, test, type APIRequestContext } from '@playwright/test'

const backend = process.env.BACKEND_URL ?? 'http://localhost:5175'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window.top === window) localStorage.setItem('open-agricola-locale-v2', 'en')
  })
})

const createReplay = async (request: APIRequestContext) => {
  const response = await request.post(`${backend}/api/test/replays/completed`)
  expect(response.status()).toBe(201)
  return await response.json() as {
    roomId: string
    firstStepHash: string
  }
}

for (const recordReplay of [true, false]) {
  test(`completed results localize generated names and preserve account names (replay=${recordReplay})`, async ({ page, request }) => {
    const response = await request.post(`${backend}/api/test/replays/completed?defaultNames=1&recordReplay=${recordReplay ? 1 : 0}`)
    expect(response.status()).toBe(201)
    const { roomId } = await response.json() as { roomId: string }
    await page.goto(`/?room=${roomId}`, { waitUntil: 'domcontentloaded' })
    const results = page.locator(recordReplay ? '.replay-results li' : '.ws-status-card li')
    await expect(results.nth(0)).toContainText('Player 2')
    await expect(results.nth(1)).toContainText('Player 2')
    if (!recordReplay) {
      await expect(page.locator('iframe')).toHaveCount(0)
      return
    }
    await page.getByRole('button', { name: /Player 2/ }).nth(1).click()
    const replay = page.frameLocator('iframe')
    await expect(replay.locator('.replay-header select option[value="p1"]')).toHaveText('Player 2')
    await expect(replay.locator('.replay-header select option[value="p2"]')).toHaveText('Player 2')
    await replay.locator('button[data-player="p2"]').click()
    await expect(replay.locator('button[data-player="p2"]')).toContainText('Player 2')
  })
}

test('anonymous completed replay supports perspectives, playback, layout, and anchors', async ({
  page,
  request,
}) => {
  const fixture = await createReplay(request)
  await page.goto(`/?room=${fixture.roomId}`)

  await expect(page.locator('iframe')).toHaveCount(0)
  const alicePerspective = page.getByRole('button', { name: /Alice/ })
  await expect(alicePerspective).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to Lobby' }))
    .toContainText('Open Agricola')
  const accessibility = await new AxeBuilder({ page })
    .include('.replay-shell--chooser')
    .analyze()
  expect(accessibility.violations).toEqual([])
  await alicePerspective.click()

  const replay = page.frameLocator('iframe')
  await expect(replay.locator('.replay-app')).toBeVisible()
  const majorSupply = replay.locator('.major-improvements')
  await expect(majorSupply).toBeVisible()
  await majorSupply.locator('h2').click()
  await expect(majorSupply.locator('[data-card-anchor="Major_Well"]')).toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.get('layout')).toBe('timeline')
  await expect.poll(() => new URL(page.url()).searchParams.get('frame')).toMatch(/^[a-f0-9]{64}$/)
  await expect(replay.locator('[data-hand-anchor="p1"] .player-card-inner')).toHaveCount(14)
  await expect(replay.locator('[data-hand-anchor="p1"] .card-title').first()).not.toHaveText('')
  const cardFrameImage = await replay.locator('.card-frame').first().evaluate(
    (element) => getComputedStyle(element).backgroundImage,
  )
  expect(cardFrameImage).toContain('https://titanxxh.github.io/open-agricola-assets/')
  expect(cardFrameImage).not.toContain('raw.githubusercontent.com')
  expect(cardFrameImage).not.toContain('/replay-viewers/')

  await replay.locator('button[data-player="p2"]').click()
  await expect(replay.locator('[data-hand-anchor="p2"]')).toHaveCount(0)
  await replay.locator('.replay-header select').selectOption('open')
  await replay.locator('button[data-player="p2"]').click()
  await expect(replay.locator('[data-hand-anchor="p2"] .player-card-inner')).toHaveCount(14)

  await replay.locator('.replay-play').click()
  await expect(replay.locator('.replay-transport output')).toContainText('2 / 2', { timeout: 5000 })
  await expect(replay.getByText('Scoring Pad')).toBeVisible()
  await replay.getByRole('button', { name: 'Close' }).click()
  await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('2')
  await replay.locator('.replay-timeline button').first().click()
  await expect(replay.locator('.replay-transport output')).toContainText('0 / 2')

  await replay.locator('.replay-transport button').nth(2).click()
  await expect(replay.locator('.replay-transport output')).toContainText('1 / 2')
  await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('1')
  await expect.poll(() => new URL(page.url()).searchParams.get('frame')).toMatch(/^[a-f0-9]{64}$/)
  await replay.locator('.replay-header select').selectOption('p2')
  await expect(replay.getByText('Hidden for this perspective')).toBeVisible()

  await replay.locator('.replay-layout-toggle').click()
  await expect.poll(() => new URL(page.url()).searchParams.get('layout')).toBe('board')
  expect(new URL(
    await page.getByRole('link', { name: 'Back to Lobby' }).getAttribute('href') ?? '',
    page.url(),
  ).search).toBe('')

  const anchor = await request.get(
    `${backend}/api/v1/replays/${fixture.roomId}/anchors/0?frame=${fixture.firstStepHash}`,
  )
  expect(anchor.status()).toBe(200)
  const mismatch = await request.get(
    `${backend}/api/v1/replays/${fixture.roomId}/anchors/0?frame=${'0'.repeat(64)}`,
  )
  expect(mismatch.status()).toBe(409)

  await page.goto(
    `/?room=${fixture.roomId}&step=0&frame=${fixture.firstStepHash}`,
  )
  await expect(page.getByRole('button', { name: /Alice/ })).toBeVisible()
  await page.goto(
    `/?room=${fixture.roomId}&step=0&frame=${'0'.repeat(64)}`,
  )
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(0)
  await page.getByRole('link', { name: 'Back to Lobby' }).click()
  await expect(page.locator('#username')).toBeVisible()
  expect(new URL(page.url()).searchParams.has('context')).toBe(false)
})

test('mobile replay defaults to board first and preserves an explicit toggle', async ({
  page,
  request,
}) => {
  const fixture = await createReplay(request)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/?room=${fixture.roomId}`)
  await expect(page.getByRole('link', { name: 'Back to Lobby' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollWidth <= document.documentElement.clientWidth
  ))).toBe(true)
  await page.getByRole('button', { name: /Alice/ }).click()

  const replay = page.frameLocator('iframe')
  await expect(replay.locator('.replay-app--board')).toBeVisible()
  const navigationBox = await page.locator('.replay-shell-nav').boundingBox()
  const frameBox = await page.locator('iframe').boundingBox()
  expect(navigationBox).not.toBeNull()
  expect(frameBox).not.toBeNull()
  expect(navigationBox!.y + navigationBox!.height).toBeLessThanOrEqual(frameBox!.y)
  await expect.poll(() => new URL(page.url()).searchParams.get('layout')).toBe('board')
  await replay.locator('.replay-layout-toggle').click()
  await expect(replay.locator('.replay-app--timeline')).toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.get('layout')).toBe('timeline')
})

for (const requestedLocale of [null, 'unknown-language']) {
  test(`replay uses the package default when locale is ${requestedLocale ?? 'absent'}`, async ({ page, request }) => {
    const fixture = await createReplay(request)
    await page.route('**/i18n/manifest.json', async route => {
      const response = await route.fetch()
      const manifest = await response.json()
      await route.fulfill({ response, json: { ...manifest, defaultLocale: 'en' } })
    })
    await page.goto(`/?room=${fixture.roomId}`)
    await page.getByRole('button', { name: /Alice/ }).click()
    const iframe = page.locator('iframe')
    await expect(iframe).toHaveAttribute('src', /replay-viewers/)
    const url = new URL(await iframe.getAttribute('src') ?? '', page.url())
    if (requestedLocale) url.searchParams.set('locale', requestedLocale)
    else url.searchParams.delete('locale')
    await page.goto(url.href)
    await expect(page.locator('.replay-kicker')).toHaveText('Game Archive')
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('button', { name: /^Switch player view:/ })).toBeVisible()
    await expect(page.locator('.replay-app')).not.toContainText('ui.copy.')
  })
}
