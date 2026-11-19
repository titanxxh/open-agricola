// @covers client/app/LobbyPage.tsx
// @covers client/app/CardEditionSetup.tsx
// @covers client/components/common/
// @covers shared/projections/
import { expect, test, type Page } from '@playwright/test'
import { CLASSIC_EDITION_ENABLED } from '../shared/contract/card-edition'
import { getEligibleClassicCardIds, getSelectableClassicDeckIds } from '../shared/cards/classic-catalog'
import { BACKEND_URL, browserRequestHeaders, finishHotseatOpening, getJson, postJson } from './fixtures'

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

const selectableDecks = getSelectableClassicDeckIds()
const playableSeats = [2, 3, 4, 5, 6].find(seats => {
  const pool = getEligibleClassicCardIds(selectableDecks, seats)
  return pool.occupation.length >= 7 * seats && pool.minor.length >= 7 * seats
})

async function openClassicHotseatSetup(page: Page) {
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  const username = `classic_${Date.now().toString(36)}`
  const headers = browserRequestHeaders()
  const oauth = await page.request.post(`${BACKEND_URL}/api/test/oauth/github/callback`, {
    headers, data: { providerUserId: username, providerLogin: username, email: `${username}@example.com`, displayName: 'Alice' },
  })
  expect(oauth.ok()).toBe(true)
  const complete = await page.request.post(`${BACKEND_URL}/api/auth/onboarding/complete`, {
    headers, data: { username, displayName: 'Alice', password: 'classic-tests-password', confirmPassword: 'classic-tests-password' },
  })
  expect(complete.ok(), `${complete.status()} ${await complete.text()}`).toBe(true)
  await page.goto('/')
  await page.getByRole('button', { name: 'Local Hotseat', exact: true }).click()
  await page.getByRole('radio', { name: 'Classic', exact: true }).check()
  await expect(page.getByRole('group', { name: 'Classic decks', exact: true })).toBeVisible()
}

async function selectAllEligibleDecks(page: Page) {
  const decks = page.getByRole('group', { name: 'Classic decks', exact: true })
  for (const checkbox of await decks.getByRole('checkbox').all()) {
    if (await checkbox.isEnabled()) await checkbox.check()
  }
}

test.describe('Classic Edition through the lobby', () => {
  test.skip(!CLASSIC_EDITION_ENABLED, 'The build-time Classic Edition switch is off')

  test('shows the shortage when the ported Classic Decks cannot fill a room', async ({ page }) => {
    test.skip(playableSeats !== undefined, 'The ported Classic Decks can now fill a room')
    await openClassicHotseatSetup(page)
    await selectAllEligibleDecks(page)
    await expect(page.getByRole('button', { name: 'Start Hotseat Game', exact: true })).toBeDisabled()
    const shortage = page.getByRole('status').filter({ hasText: /cannot fill 2 hands/ })
    await expect(shortage).toBeVisible()
    const expected = await shortage.innerText()
    const eligible = selectableDecks.filter(deck => {
      const pool = getEligibleClassicCardIds([deck], 2)
      return pool.occupation.length + pool.minor.length > 0
    })
    const query = new URLSearchParams({
      page: 'game', transport: 'ws', hotseat: '1', maxPlayers: '2', cardEdition: 'classic',
      classicDeckIds: eligible.join(','),
    })
    await page.goto(`/?${query}`)
    await expect(page.getByText(expected, { exact: true })).toBeVisible()
  })

  test('starts a Classic room and renders a complete Classic hand', async ({ page }) => {
    test.skip(playableSeats === undefined, 'The ported Classic Decks cannot yet fill any room')
    await openClassicHotseatSetup(page)
    await page.getByRole('button', { name: `${playableSeats} Players`, exact: true }).click()
    await selectAllEligibleDecks(page)
    await page.getByRole('checkbox', { name: /Snake opening/ }).uncheck()
    await page.getByRole('button', { name: 'Start Hotseat Game', exact: true }).click()
    await finishHotseatOpening(page)

    const cards = page.locator('.hand-cards .player-card-inner[data-id]')
    await expect(cards).toHaveCount(14)
    const numbered = await cards.evaluateAll(elements => elements.map(card => {
      const number = card.querySelector('.card-numbering')
      if (!number) throw new Error('Expected a number on the card face')
      const text = document.createRange()
      text.selectNodeContents(number)
      return {
        id: card.getAttribute('data-id'), number: number.textContent,
        title: card.querySelector('.card-title')?.textContent,
        numberWidth: number.getBoundingClientRect().width,
        textWidth: text.getBoundingClientRect().width,
      }
    }))
    for (const card of numbered) {
      expect(card.id).toMatch(/^C[A-Z]+\d{3}_/)
      expect(card.number).toBe(card.id?.split('_')[0])
      expect(card.title).toBeTruthy()
      expect(card.numberWidth).toBeGreaterThanOrEqual(card.textWidth)
    }
    const face = cards.first().locator('.card-icon')
    await face.scrollIntoViewIfNeeded()
    const path = await face.evaluate(async element => {
      const source = getComputedStyle(element).backgroundImage.slice(5, -2)
      const image = new Image()
      image.src = source
      await image.decode()
      return source
    })
    expect(path).toMatch(/\/assets\/classic\/[A-Z]+\/C[A-Z]+\d{3}\.png/)
    await cards.first().screenshot({ path: test.info().outputPath('classic-hand-card.png') })
  })
})
