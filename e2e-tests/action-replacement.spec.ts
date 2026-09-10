import { test, expect } from '@playwright/test'
import { BACKEND_URL, getJson, postJson } from './fixtures'

for (const replace of [true, false]) {
  test(`C140 explicitly ${replace ? 'accepts' : 'declines'} replacement before the optional improvement`, async ({ page, request }) => {
    await postJson(request, `${BACKEND_URL}/api/game/new-sandbox`, { seed: 850, playerCount: 2, customCardIds: [] })
    const current = await getJson(request, `${BACKEND_URL}/api/game/state`)
    const state = current.state
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      for (const key of Object.keys(player.resources)) player.resources[key] = 0
    }
    state.players[0].occupationPlayed = ['C140_PackagingArtist']
    state.players[0].improvements = ['Major_Fireplace1']
    state.players[0].resources.grain = 1
    await postJson(request, `${BACKEND_URL}/api/game/load`, { state })
    await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
    await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
    await expect(page.locator('.action-board')).toBeVisible()
    await page.locator('[data-action-id="meeting-place"] button').first().click()
    await expect(page.getByText('Choose a replacement or keep the original action', { exact: true })).toBeVisible()
    const before = await getJson(request, `${BACKEND_URL}/api/game/state`)
    expect(before.state.players[0].resources).toMatchObject({ grain: 1, food: 0 })
    await expect(page.getByRole('button', { name: 'Do not replace', exact: true })).toBeVisible()
    if (replace) {
      await page.locator('.interaction-actions').getByRole('button', { name: /Bake Bread/ }).click()
      await page.getByRole('button', { name: '+', exact: true }).click()
      await page.getByRole('button', { name: 'Confirm', exact: true }).click()
    } else {
      await page.getByRole('button', { name: 'Do not replace', exact: true }).click()
    }
    await expect.poll(async () => (await getJson(request, `${BACKEND_URL}/api/game/state`)).state.players[0].resources)
      .toMatchObject({ grain: replace ? 0 : 1, food: replace ? 2 : 0 })
    await expect(page.getByText('Choose a replacement or keep the original action', { exact: true })).toBeHidden()
  })
}
