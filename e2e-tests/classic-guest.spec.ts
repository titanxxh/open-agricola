// @covers client/components/board/
// @covers client/components/interaction/
// @covers shared/events/
import { expect, test } from '@playwright/test'
import type { GameSyncPayload } from '../shared/contract/protocol/game'
import { BACKEND_URL, getJson, postJson } from './fixtures'

test('a Guest from CI073 is scheduled, dispatched with its source label, and returned home', async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  expect((await postJson(request, `${BACKEND_URL}/api/game/new-sandbox`, {
    seed: 62, playerCount: 2, customCardIds: [],
  })).ok).toBe(true)
  const { state }: GameSyncPayload = await getJson(request, `${BACKEND_URL}/api/game/state`)
  for (const player of state.players) {
    player.occupationHand = ['__test_placeholder__']
    player.minorHand = ['__test_placeholder__']
  }
  state.players[0]!.name = 'Alice'
  state.players[0]!.nameIsDefault = false
  expect((await postJson(request, `${BACKEND_URL}/api/game/load`, { state })).ok).toBe(true)
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  await expect(page.locator('.game-layout')).toBeVisible()

  const panel = page.locator('.dev-panel')
  await panel.getByPlaceholder('card-id').fill('CI073')
  await panel.getByRole('button', { name: 'Play Card', exact: true }).click()

  const upcomingRound = page.locator('.turn-action-container').nth(1)
  await expect(upcomingRound.locator('[data-source-card="CI073_Guest"] .res-icon-guest')).toBeVisible()
  const logRow = (text: string) => page.locator('.action-log__entry').filter({ hasText: text })
  const grant = logRow('Alice receives a Guest from Guest for round 2')
  await expect(grant).toHaveCount(1)
  await expect(grant.locator('.action-log__icon .res-icon-guest')).toBeVisible()

  const space = (id: string) => page.locator(`.action-card-holder[data-action-id="${id}"]`)
  const confirm = page.locator('.interaction-bar').getByRole('button', { name: 'Confirm switch', exact: true })
  const takeTurn = async (id: string) => {
    await space(id).locator('button.action-card').click()
    await confirm.click()
  }
  for (const id of ['forest', 'day-laborer', 'clay-pit', 'reed-bank']) await takeTurn(id)

  await expect(page.locator('.future-effect-marker[data-source-card="CI073_Guest"]')).toHaveCount(0)
  const pendingGuests = page.getByRole('img', { name: 'Guests available (1)' })
  await expect(pendingGuests.first()).toBeVisible()
  await page.getByRole('button', { name: 'Dispatch Guest (Guest)', exact: true }).click()
  const fishing = space('fishing')
  await fishing.locator('button.action-card').click()
  await expect(fishing).toHaveCSS('animation-name', 'public-event-highlight-pulse')
  const marker = fishing.getByRole('img', { name: "Alice's Guest (Guest)" })
  await expect(marker).toHaveAttribute('title', "Alice's Guest (Guest)")
  await marker.locator('.action-guest').hover()
  await expect(pendingGuests).toHaveCount(0)
  const dispatch = logRow('Alice dispatches a Guest to Fishing')
  await expect(dispatch).toHaveCount(1)
  await expect(dispatch.locator('.action-log__icon .res-icon-guest')).toBeVisible()

  await confirm.click()
  for (const id of ['forest', 'day-laborer', 'clay-pit', 'reed-bank']) await takeTurn(id)
  await expect(marker).toHaveCount(0)
  await expect(dispatch).toHaveCount(1)
})
