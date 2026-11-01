import { expect, test, type Page } from '@playwright/test'
import { BACKEND_URL, FRONTEND_URL, getJson, postJson } from './fixtures'

const preview = (page: Page) => page.locator('.action-reference-preview')
const face = (page: Page) => page.locator('.encyclopedia-detail__face')
async function visit(page: Page, locale: string, card: string) {
  await page.addInitScript(value => localStorage.setItem('open-agricola-locale-v2', value), locale)
  await page.goto(`${FRONTEND_URL}/?page=encyclopedia&entry=${encodeURIComponent(`card:${card}`)}`)
  await expect(page.locator('.encyclopedia-detail')).toBeVisible()
}

for (const locale of ['en', 'zh']) {
  test(`${locale}: ordinary actions stay plain while space references open above card details`, async ({ page }) => {
    await visit(page, locale, 'A010_WoodenShed')
    await expect(face(page).locator('[data-action-reference]')).toHaveCount(0)
    await visit(page, locale, 'B059_FoodChest')
    const reference = face(page).locator('[data-action-reference="space:major-improvement"]')
    await expect(reference).toHaveCSS('text-decoration-line', 'underline')
    await expect(reference).toHaveCSS('font-style', 'normal')
    await reference.hover()
    await expect(preview(page)).toBeVisible()
    await expect(preview(page).locator('[data-reference-target="major-improvement"]')).toHaveCount(1)
    await expect(preview(page).locator('.tooltip-action-card')).toBeVisible()
    await expect.poll(() => preview(page).locator('.action-space-face__frame').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0), { timeout: 30_000 }).toBe(true)
    await preview(page).hover()
    await expect(preview(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(preview(page)).toHaveCount(0)
    await expect(page.locator('.encyclopedia-detail')).toBeVisible()
    await expect(reference).toBeFocused()
    await reference.press('Enter')
    await expect(preview(page)).toBeVisible()
    await page.screenshot({ path: `output/action-reference-space-${locale}.png` })
  })

  test(`${locale}: quarry references show both targets without exposing internal identifiers`, async ({ page }) => {
    await visit(page, locale, 'A023_StoneCompany')
    await face(page).locator('[data-action-reference]').hover()
    await expect(preview(page).locator('[data-reference-target]')).toHaveCount(2)
    await expect(preview(page).locator('[data-reference-target="western-quarry"]')).toBeVisible()
    await expect(preview(page).locator('[data-reference-target="eastern-quarry"]')).toBeAttached()
    await expect(face(page)).not.toContainText('space:')
  })

  test(`${locale}: Moor special action references show card art and localized effects`, async ({ page }) => {
    await visit(page, locale, 'M083_CoalSeam')
    await face(page).locator('[data-action-reference="moor:hiring-fair"]').hover()
    await expect(preview(page).locator('img').first()).toBeVisible()
    await expect(preview(page).locator('[data-reference-highlight]').first()).toContainText(locale === 'en' ? 'Hiring Fair' : '雇工集市')
    await expect(preview(page).locator('[data-reference-highlight] [role="img"]').first()).toHaveAttribute('aria-label', /.+/)
    await page.screenshot({ path: `output/action-reference-moor-${locale}.png` })
  })
}

test('mobile: a tap opens a bounded preview, scrolling works and closing keeps the card detail', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  try {
    await visit(page, 'zh', 'M083_CoalSeam')
    const reference = face(page).locator('[data-action-reference="moor:hiring-fair"]')
    await reference.tap()
    await expect(preview(page)).toBeVisible()
    await expect.poll(() => preview(page).evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
    await preview(page).evaluate(element => { element.scrollTop = element.scrollHeight })
    await expect(preview(page)).toBeVisible()
    const box = await preview(page).boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(390)
    expect(box!.y + box!.height).toBeLessThanOrEqual(844)
    await page.screenshot({ path: 'output/action-reference-mobile.png' })
    await preview(page).evaluate(element => { element.scrollTop = 0 })
    await preview(page).getByRole('button', { name: '关闭', exact: true }).tap()
    await expect(preview(page)).toHaveCount(0)
    await expect(page.locator('.encyclopedia-detail')).toBeVisible()
  } finally { await context.close() }
})

test('Moor art failure retains the target name, player counts and effects', async ({ page }) => {
  await page.route('**/assets/moor/special-action-card/**', route => route.abort())
  await visit(page, 'en', 'M083_CoalSeam')
  await face(page).locator('[data-action-reference="moor:hiring-fair"]').hover()
  await expect(preview(page).locator('[data-reference-highlight]').first()).toContainText('Hiring Fair')
  await expect(preview(page).locator('.action-reference-preview__players').first()).toContainText('players')
  await expect(preview(page).locator('img')).toHaveCount(0)
})

test('action-space art failure retains the localized printed rules', async ({ page }) => {
  await page.route('**/assets/revised/action_frame.png*', route => route.abort())
  await visit(page, 'zh', 'B059_FoodChest')
  await face(page).locator('[data-action-reference]').hover()
  await expect(preview(page)).toContainText('建造主要改良或打出小改良')
  await expect(preview(page).locator('.action-space-face__frame')).toHaveCount(0)
})

test('a failed catalog request can be retried by reopening the reference', async ({ page }) => {
  let fail = true
  await page.route('**/action-references.json', route => fail ? route.fulfill({ status: 503, body: '' }) : route.continue())
  await visit(page, 'en', 'B059_FoodChest')
  const reference = face(page).locator('[data-action-reference]')
  await reference.hover()
  await expect(preview(page)).toContainText('Preview could not load')
  await page.keyboard.press('Escape')
  fail = false
  await reference.press('Enter')
  await expect(preview(page).locator('[data-reference-target="major-improvement"]')).toBeVisible()
})

test('in-game references use the current player count without playing the containing card', async ({ page, request }) => {
  await postJson(request, `${BACKEND_URL}/api/game/new`, { seed: 7, maxPlayers: 2 })
  const { state } = await getJson(request, `${BACKEND_URL}/api/game/state`)
  state.phase = 'playing'
  state.roundPhase = 'work'
  state.currentPlayerIndex = 0
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  state.players[0].occupationHand = ['D112_YoungFarmer']
  await postJson(request, `${BACKEND_URL}/api/game/load`, { state })
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  await page.goto(`${FRONTEND_URL}/?page=game&player=p1&embedded=1&devMode=1`)
  const card = page.locator('.hand-cards [data-id="D112_YoungFarmer"]')
  const reference = card.locator('[data-action-reference]').first()
  await card.locator('.card-title').hover()
  await expect(page.locator('.card-hover-preview')).toBeVisible()
  await reference.hover()
  await expect(preview(page)).toBeVisible()
  await expect(page.locator('.card-hover-preview')).toHaveCount(0)
  await card.locator('.card-title').hover()
  await expect(page.locator('.card-hover-preview')).toBeVisible()
  await reference.hover()
  await preview(page).hover()
  await expect(page.locator('.card-hover-preview')).toHaveCount(0)
  await reference.click()
  await expect(preview(page).locator('.action-reference-preview__players')).toHaveText('2 players')
  const current = (await getJson(request, `${BACKEND_URL}/api/game/state`)).state
  expect(current.players[0].occupationHand).toEqual(['D112_YoungFarmer'])
  expect(current.players[0].occupationPlayed).toEqual(state.players[0].occupationPlayed)
})

test('touch card details allow reference inspection without selecting or playing the card', async ({ browser, request }) => {
  await postJson(request, `${BACKEND_URL}/api/game/new`, { seed: 7, maxPlayers: 2 })
  const { state } = await getJson(request, `${BACKEND_URL}/api/game/state`)
  state.phase = 'playing'; state.roundPhase = 'work'; state.currentPlayerIndex = 0
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']; player.occupationHand = ['__test_placeholder__']
  }
  state.players[0].occupationHand = ['D112_YoungFarmer']
  await postJson(request, `${BACKEND_URL}/api/game/load`, { state })
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  try {
    await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
    await page.goto(`${FRONTEND_URL}/?page=game&player=p1&embedded=1&devMode=1`)
    await page.locator('.hand-cards [data-id="D112_YoungFarmer"] .card-title').tap()
    const details = page.getByRole('dialog', { name: 'Card details', exact: true })
    await expect(details).toBeVisible()
    await details.locator('[data-action-reference]').tap()
    await expect(preview(page).locator('.action-reference-preview__players')).toHaveText('2 players')
    await preview(page).getByRole('button', { name: 'Close', exact: true }).tap()
    await expect(preview(page)).toHaveCount(0)
    await expect(details).toBeVisible()
    const current = (await getJson(request, `${BACKEND_URL}/api/game/state`)).state
    expect(current.players[0].occupationHand).toEqual(['D112_YoungFarmer'])
    expect(current.players[0].occupationPlayed).toEqual(state.players[0].occupationPlayed)
    await page.screenshot({ path: 'output/action-reference-touch-details.png' })
  } finally { await context.close() }
})
