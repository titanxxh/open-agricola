import { expect, test } from '@playwright/test'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'
import type { SessionResponse } from '../shared/contract/types'
import { BACKEND_URL } from './fixtures'

for (const scenario of [{ locale: 'en', width: 1440 }, { locale: 'zh', width: 390 }] as const) {
  test(`Part-Time Worker offers mixed returns after collecting and survives reload in ${scenario.locale}`, async ({ page, request }) => {
    await page.setViewportSize({ width: scenario.width, height: 1000 })
    await page.addInitScript(locale => localStorage.setItem('open-agricola-locale-v2', locale), scenario.locale)
    expect((await request.post(`${BACKEND_URL}/api/game/new-sandbox`, {
      data: { seed: 42, playerCount: 5, customCardIds: [] },
    })).ok()).toBe(true)
    const fixture = createWorkSession({ seed: 42, options: { playerCount: 5 }, configure: state => {
      const player = state.players[0]!
      player.occupationPlayed = ['D180_PartTimeWorker']
      Object.assign(player.resources, { wood: 0, clay: 0, food: 2 })
      state.actionSpaces.find(space => space.id === 'forest')!.resources = { wood: 2, clay: 2 }
    } })
    try {
      expect((await request.post(`${BACKEND_URL}/api/game/load`, {
        data: { state: fixture.withCtx(() => serializeState(fixture.state, {})) },
      })).ok()).toBe(true)
    } finally { fixture.dispose() }
    await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
    const collected = page.waitForResponse(response => response.url().endsWith('/api/game/action'))
    await page.locator('[data-action-id="forest"] button').first().click()
    const offered: SessionResponse = await (await collected).json()
    expect(offered.ok, offered.error).toBe(true)
    expect(offered.state.players[0]!.resources).toMatchObject({ wood: 2, clay: 2, boar: 0 })
    expect(offered.state.actionSpaces.find(space => space.id === 'forest')!.resources).toMatchObject({ wood: 0, clay: 0 })
    if (offered.interaction.stateId !== 'wait') throw new Error('Expected return choices')
    const options = offered.interaction.request.options?.filter(option => option.value !== '__skip__') ?? []
    expect(options).toHaveLength(3)
    const mixed = options.find(option => option.effectPreview?.kind === 'resourceMovement'
      && option.effectPreview.resources.wood === 1 && option.effectPreview.resources.clay === 1)!
    expect(mixed).toBeDefined()
    const choice = () => page.locator(`.interaction-bar [data-choice-value="${mixed.value}"]`)
    await expect(choice()).toContainText(scenario.locale === 'en' ? 'Return to' : '归还到')
    await expect(choice().locator('[data-resource="wood"][data-amount="1"]')).toBeVisible()
    await expect(choice().locator('[data-resource="clay"][data-amount="1"]')).toBeVisible()
    await page.screenshot({ path: `output/playwright/D180-pending-${scenario.locale}.png` })
    await page.reload()
    await expect(choice()).toBeEnabled()
    const returned = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
    await choice().click()
    const chosen: SessionResponse = await (await returned).json()
    expect(chosen.ok, chosen.error).toBe(true)
    await expect(page.locator('.interaction-reorg-panel')).toBeVisible()
    const housed = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
    await page.locator('.interaction-reorg-panel').getByRole('button', {
      name: scenario.locale === 'en' ? 'Confirm' : '确认调整', exact: true,
    }).click()
    const result: SessionResponse = await (await housed).json()
    expect(result.ok, result.error).toBe(true)
    expect(result.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 1, boar: 1 })
    expect(result.state.players[0]!.stats.resourcesFromBoard).toMatchObject({ wood: 2, clay: 2 })
    expect(result.state.actionSpaces.find(space => space.id === 'forest')!.resources).toMatchObject({ wood: 1, clay: 1 })
    expect(result.state.events.filter(event => event.type === 'resource.moved').map(event => [event.reason, event.resources]))
      .toEqual([['collect', { wood: 2, clay: 2 }], ['return', { wood: 1, clay: 1 }], ['cardEffect', { boar: 1 }]])
    await expect(page.locator('.interaction-reorg-panel')).toHaveCount(0)
    await page.screenshot({ path: `output/playwright/D180-return-${scenario.locale}.png` })
  })
}
