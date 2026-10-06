import { expect, test, type FrameLocator, type Page } from '@playwright/test'
import type { GameState } from '../shared/contract/types'
import { BACKEND_URL, getJson, postJson } from './fixtures'

const expectPublicCards = async (view: Page | FrameLocator) => {
  const groups = view.locator('.played-card-slot').filter({ has: view.locator('[data-card-anchor="C146_WorkshopAssistant"]') }).locator('.card-resource-groups')
  await expect(groups.locator('.card-stack-pair')).toHaveCount(3)
  await expect(groups.locator('.card-stack-pair').nth(0).locator('.res-icon-wood')).toBeVisible()
  await expect(groups.locator('.card-stack-pair').nth(0).locator('.res-icon-clay')).toBeVisible()
  const lying = view.locator('.played-card-slot').filter({ has: view.locator('[data-card-anchor="M084_BogPony"]') })
    .locator('[data-animal-pose="lying"]')
  await expect(lying).toHaveAttribute('aria-label', 'horse: 1')
  expect(await lying.locator('.res-icon-horse').evaluate(element => getComputedStyle(element).transform))
    .toBe('matrix(0, 1, -1, 0, 0, 0)')
  await expect(view.locator('.played-card-slot').filter({ has: view.locator('[data-card-anchor="D075_WoodField"]') }).locator('.field-crop-segment')).toHaveCount(2)
  await expect(view.getByTestId('played-card-held-worker-C022_BasketChair')).toBeVisible()
  await expect(view.locator('.lazybones-stable-marker')).toHaveAttribute('title', /Lazybones/)
}

test('public Card State facts render in live seat views and a newly pinned Replay Viewer', async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  expect((await postJson(request, `${BACKEND_URL}/api/game/new-sandbox`, {
    seed: 1001, playerCount: 2, customCardIds: [], enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })).ok).toBe(true)
  const { state } = await getJson(request, `${BACKEND_URL}/api/game/state`) as { state: GameState }
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  const owner = state.players[0]!
  owner.occupationPlayed = ['C146_WorkshopAssistant', 'E148_Lazybones']
  owner.minorPlayed = ['M084_BogPony', 'D075_WoodField', 'C022_BasketChair']
  owner.cardStates = {
    C146_WorkshopAssistant: { extraData: { pairs: ['WC', 'CS', 'RS'], internal: 'INTERNAL_BROWSER_SENTINEL' },
      privateData: { observed: 'OWNER_BROWSER_SECRET' } },
    M084_BogPony: { extraData: { lyingHorseCount: 1 } },
    D075_WoodField: { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 2 }, { crop: 'wood', remaining: 1 }] } },
    C022_BasketChair: { extraData: { heldWorkerId: '1' } },
    E148_Lazybones: { extraData: { reservedActionSpaces: ['forest'] } },
  }
  expect((await postJson(request, `${BACKEND_URL}/api/game/load`, { state })).ok).toBe(true)
  for (const viewer of ['p1', 'p2']) {
    const response = await request.get(`${BACKEND_URL}/api/game/state`, { headers: { 'X-Viewer-Player': viewer } })
    const payload = await response.json()
    expect(JSON.stringify(payload)).not.toContain('INTERNAL_BROWSER_SENTINEL')
    expect(payload.state.players[0].cardStatePresentation.C146_WorkshopAssistant.resourceGroups).toHaveLength(3)
    if (viewer === 'p1') expect(JSON.stringify(payload)).toContain('OWNER_BROWSER_SECRET')
    else expect(JSON.stringify(payload)).not.toContain('OWNER_BROWSER_SECRET')
  }
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  await expect(page.locator('.game-layout')).toBeVisible()
  await expectPublicCards(page)
  await page.reload()
  await expectPublicCards(page)

  const completed = await request.post(`${BACKEND_URL}/api/test/replays/completed`, { data: { state } })
  expect(completed.status(), await completed.text()).toBe(201)
  const { roomId } = await completed.json() as { roomId: string }
  await page.goto(`/?context=${roomId}`)
  await page.getByRole('button', { name: /Player 1/ }).click()
  const replay = page.frameLocator('iframe')
  await expect(replay.locator('.replay-app')).toBeVisible()
  await expectPublicCards(replay)
  await replay.locator('.replay-header select').selectOption('p2')
  await replay.locator('button[data-player="p1"]').click()
  await expectPublicCards(replay)
  await replay.locator('.replay-header select').selectOption('open')
  await expectPublicCards(replay)
})
