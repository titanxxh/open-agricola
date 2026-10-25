import { expect, test } from '@playwright/test'
import { BACKEND_URL, FRONTEND_URL, getJson, postJson } from './fixtures'

for (const locale of ['zh', 'en'] as const) {
  test(`${locale} shows the Thresher face, resource icons and before-action source`, async ({ page, request }) => {
    await page.addInitScript((value) => localStorage.setItem('open-agricola-locale-v2', value), locale)
    await postJson(request, `${BACKEND_URL}/api/game/new`, { seed: 7, maxPlayers: 2 })
    const { state } = await getJson(request, `${BACKEND_URL}/api/game/state`)
    state.phase = 'playing'
    state.currentPlayerIndex = 0
    state.round = 8
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    state.players[0].occupationPlayed = ['C112_Thresher']
    Object.assign(state.players[0].resources, { food: 1, grain: 0 })
    expect((await postJson(request, `${BACKEND_URL}/api/game/load`, { state })).ok).toBe(true)
    await page.goto(`${FRONTEND_URL}/?page=game&player=p1&embedded=1&devMode=1`)
    const name = locale === 'zh' ? '打谷者' : 'Thresher'
    const card = page.locator('[data-id="C112_Thresher"]').first()
    await expect(card.locator('.card-title')).toHaveText(name)
    await expect(card.locator('.card-desc')).toContainText(locale === 'zh' ? '农田' : 'Farmland')
    await expect(card.locator('.card-desc .res-icon-food')).toHaveCount(1)
    await expect(card.locator('.card-desc .res-icon-grain')).toHaveCount(1)
    await page.locator('.action-card-holder[data-action-id="farmland"]').click()
    await expect(page.locator('.interaction-bar').getByRole('button', {
      name: locale === 'zh' ? '不使用打谷者' : 'Do not use Thresher', exact: true,
    })).toBeVisible()
    await expect(page.locator('.interaction-bar')).toContainText(locale === 'zh' ? '由 打谷者 触发' : 'Triggered by Thresher')
    await expect(page.locator('.interaction-bar')).not.toContainText('脱粒机')
    await page.screenshot({ path: `output/playwright/bga-thresher-${locale}.png` })
  })

  test(`${locale} uses one Hammer Crusher name in its face, prompt, trigger, and log`, async ({ page, request }) => {
    await page.addInitScript((value) => localStorage.setItem('open-agricola-locale-v2', value), locale)
    await postJson(request, `${BACKEND_URL}/api/game/new`, { seed: 7, maxPlayers: 2 })
    const { state } = await getJson(request, `${BACKEND_URL}/api/game/state`)
    state.phase = 'playing'
    state.currentPlayerIndex = 0
    // House Redevelopment is revealed in rounds 5–7, so it is clickable by round 8.
    state.round = 8
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    const actor = state.players[0]
    actor.houseType = 'clay'
    actor.rooms = 2
    actor.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }]
    Object.assign(actor.resources, { clay: 3, reed: 1, stone: 2 })
    actor.minorPlayed = ['D014_HammerCrusher']
    expect((await postJson(request, `${BACKEND_URL}/api/game/load`, { state })).ok).toBe(true)
    await page.goto(`${FRONTEND_URL}/?page=game&player=p1&embedded=1&devMode=1`)
    const name = locale === 'zh' ? '碎石锤' : 'Hammer Crusher'
    await expect(page.locator('[data-id="D014_HammerCrusher"] .card-title').first()).toHaveText(name)
    await page.locator('.action-card-holder[data-action-id="house-redevelopment"]').click()
    await expect(page.locator('.interaction-bar')).toContainText(locale === 'zh'
      ? '碎石锤：建造房间？' : 'Hammer Crusher: Build rooms?')
    await expect(page.locator('.interaction-bar')).toContainText(locale === 'zh'
      ? '由 碎石锤 触发' : 'Triggered by Hammer Crusher')
    await page.getByRole('button', { name: locale === 'zh' ? '跳过' : 'Skip', exact: true }).click()
    await expect(page.locator('.action-log')).toContainText(name)
    await expect(page.locator('.game-layout')).not.toContainText(/碎锤|\{card:/)
  })

  test(`${locale} localizes the workshop sandbox Moor settings`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('open-agricola-locale-v2', value), locale)
    await page.goto(`${FRONTEND_URL}/?page=workshop&player=p1&devMode=1`)
    await expect(page.getByTestId('workshop-root')).toBeVisible()
    await page.getByRole('button', { name: locale === 'zh' ? '调整配置' : 'Adjust config', exact: true }).click()
    const modal = page.locator('.ws-reset-modal')
    await expect(modal.getByRole('checkbox', { name: locale === 'zh' ? '四季' : 'Through the Seasons', exact: true })).toBeVisible()
    await modal.getByRole('checkbox', { name: locale === 'zh' ? '沼泽农夫' : 'Farmers of the Moor', exact: true }).check()
    await expect(modal.getByRole('checkbox', { name: locale === 'zh'
      ? '允许沼泽农夫小改良池不完整' : 'Allow incomplete Farmers of the Moor minor pool', exact: true })).toBeVisible()
    if (locale === 'zh') await expect(modal).not.toContainText('Farmers of the Moor')
  })
}
