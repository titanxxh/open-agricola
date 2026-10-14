import { expect, test } from '@playwright/test'
import type { SessionResponse } from '../server/game/authoritative-session'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'
import { BACKEND_URL } from './fixtures'

for (const food of [0, 20]) {
  test(`Paper Maker offers its exchange before learning with ${food} food and restores the choice on reload`, async ({ page, request }) => {
    const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, {
      data: { seed: 4242, playerCount: 2, customCardIds: [] },
    })
    expect(fresh.ok()).toBe(true)
    const session = createWorkSession({
      seed: 4242,
      configure(state) {
        state.round = 8
        const player = state.players[0]!
        player.occupationPlayed = ['B109_PaperMaker', 'A110_Roughcaster']
        player.occupationHand = ['A123_FrameBuilder', 'A114_SeasonalWorker']
        Object.assign(player.resources, { food, wood: 1 })
      },
    })
    try {
      const loaded = await request.post(`${BACKEND_URL}/api/game/load`, {
        data: { state: session.withCtx(() => serializeState(session.state, {})) },
      })
      expect(loaded.ok()).toBe(true)
    } finally {
      session.dispose()
    }
    await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
    await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
    const lessons = page.locator('[data-action-id="lessons"] button').first()
    await expect(lessons).toBeEnabled()
    await lessons.click()
    const pending: SessionResponse = await (await request.get(`${BACKEND_URL}/api/game/state`)).json()
    expect(pending.state.players[0]!.resources).toMatchObject({ food, wood: 1 })
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'choice') {
      throw new Error('Expected the Paper Maker exchange choice')
    }
    expect(pending.interaction.sourceCard).toBe('B109_PaperMaker')
    const accept = pending.interaction.request.options.find(option => option.value !== '__skip__')
    if (!accept) throw new Error('No exchange option offered')
    const exchange = page.locator('.interaction-bar').locator(`[data-choice-value="${accept.value}"]`)
    await expect(exchange.locator('[data-resource="wood"]')).toHaveAttribute('data-amount', '1')
    await expect(exchange.locator('[data-resource="food"]')).toHaveAttribute('data-amount', '2')
    await expect(page.locator('.interaction-bar [data-choice-value="__skip__"]')).toBeVisible()
    await page.reload()
    await expect(exchange).toBeVisible()
    const exchanged = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
    await exchange.click()
    const afterExchange: SessionResponse = await (await exchanged).json()
    expect(afterExchange.ok).toBe(true)
    expect(afterExchange.state.players[0]!.resources).toMatchObject({ food: food + 2, wood: 0 })
    const occupation = page.locator('.interaction-bar [data-choice-value="A123_FrameBuilder"]')
    await expect(occupation).toContainText('Frame Builder')
    const played = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
    await occupation.click()
    const result: SessionResponse = await (await played).json()
    expect(result.ok).toBe(true)
    expect(result.state.players[0]!.occupationPlayed).toContain('A123_FrameBuilder')
    expect(result.state.players[0]!.resources).toMatchObject({ food: food + 1, wood: 0 })
    await page.reload()
    await expect(page.locator('.interaction-bar').getByRole('button', { name: 'Confirm switch' })).toBeVisible()
    const restored: SessionResponse = await (await request.get(`${BACKEND_URL}/api/game/state`)).json()
    expect(restored.state.players[0]!.resources).toMatchObject({ food: food + 1, wood: 0 })
    await page.screenshot({ path: `output/playwright/paper-maker-exchange-food-${food}.png` })
  })
}
