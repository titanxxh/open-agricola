// @covers client/components/common/
// @covers shared/projections/
import { expect, test } from '@playwright/test'
import { BACKEND_URL, getJson, postJson } from './fixtures'

test('a dev-drawn classic card shows its classic face and prefixed number in the hand', async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  expect((await postJson(request, `${BACKEND_URL}/api/game/new-sandbox`, { seed: 203, playerCount: 2, customCardIds: [] })).ok).toBe(true)
  const { state } = await getJson(request, `${BACKEND_URL}/api/game/state`)
  for (const player of state.players) {
    player.occupationHand = ['__test_placeholder__']
    player.minorHand = ['__test_placeholder__']
  }
  expect((await postJson(request, `${BACKEND_URL}/api/game/load`, { state })).ok).toBe(true)
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  await expect(page.locator('.game-layout')).toBeVisible()

  const panel = page.locator('.dev-panel')
  await panel.getByPlaceholder('card-id').fill('CE203')
  await panel.getByRole('button', { name: 'Draw Card', exact: true }).click()

  const card = page.locator('.hand-cards [data-id="CE203_Shepherd"]')
  await expect(card).toHaveCount(1)
  await card.scrollIntoViewIfNeeded()
  await expect(card.locator('.card-title')).toHaveText('Shepherd')
  await expect(card.locator('.card-numbering')).toHaveText('CE203')
  await expect(card.locator('.card-desc')).toContainText('During each breeding phase')
  const face = await card.locator('.card-icon').evaluate(async element => {
    const source = getComputedStyle(element).backgroundImage.slice(5, -2)
    const image = new Image()
    image.src = source
    await image.decode()
    return { source, width: image.naturalWidth }
  })
  expect(face.source).toContain('/assets/classic/CE/CE203.png')
  expect(face.width).toBeGreaterThan(0)
  await card.screenshot({ path: 'output/playwright/classic-card-face-CE203.png' })
})
