import { test, expect } from '@playwright/test'
import { BACKEND_URL, FRONTEND_URL, getJson, postJson } from './fixtures'

test.describe('Parent Cards ordinary draw UI', () => {
  test('keeps one drawn ordinary card from the overlay', async ({ page, request }) => {
    await postJson(request, `${BACKEND_URL}/api/game/new`)
    const current = await getJson(request, `${BACKEND_URL}/api/game/state`)
    const state = current.state
    state.phase = 'playing'
    state.currentPlayerIndex = 0
    state.ordinaryCardDrawChoices = {
      'ordinary-card-draw-99': {
        id: 'ordinary-card-draw-99',
        playerId: 'p1',
        cardType: 'occupation',
        candidates: ['E164_MountainPlowman', 'E105_Pioneer', 'E113_Godmother'],
        sourceCard: 'PS03',
        sourceActionId: 'complete-parent-father',
      },
    }
    await postJson(request, `${BACKEND_URL}/api/game/load`, { state })

    await page.goto(`${FRONTEND_URL}/?page=game&player=p1&devMode=1`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('dialog', { name: 'Ordinary card draw choice' })).toBeVisible()
    await page.getByRole('button', { name: 'Keep E105_Pioneer' }).click()
    await expect(page.getByRole('dialog', { name: 'Ordinary card draw choice' })).toBeHidden()

    const after = await getJson(request, `${BACKEND_URL}/api/game/state`)
    expect(after.state.players[0].occupationHand).toContain('E105_Pioneer')
    expect(after.state.ordinaryCardDrawChoices).toEqual({})
  })
})
