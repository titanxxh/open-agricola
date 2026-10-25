import { expect, test } from '@playwright/test'
import type { SerializedGameState } from '../shared/session/serialization'
import { BACKEND_URL } from './fixtures'

for (const scenario of [{ locale: 'en', width: 1440 }, { locale: 'zh', width: 390 }] as const) {
  test(`actual anytime plans and player-separated schedules in ${scenario.locale}`, async ({ page, request }) => {
    await page.setViewportSize({ width: scenario.width, height: 1000 })
    await page.addInitScript(locale => localStorage.setItem('open-agricola-locale-v2', locale), scenario.locale)
    const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, { data: { seed: 6117, playerCount: 2, customCardIds: [] } })
    expect(fresh.ok()).toBe(true)
    const { state } = await fresh.json() as { state: SerializedGameState }
    state.round = 5
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.resources.food = 20
    }
    const owner = state.players[0]!
    owner.color = 'red'
    owner.occupationPlayed = ['D106_WhiskyDistiller']
    owner.minorPlayed = ['A074_StableTree']
    owner.resources.grain = 2
    state.players[1]!.color = 'blue'
    state.players[1]!.minorPlayed = ['B069_PottersMarket']
    state.futureMeeples = [
      { id: 'wood-plan', cardId: 'A074_StableTree', playerId: owner.id, round: 7, resources: { wood: 1 } },
      { id: 'vegetable-plan', cardId: 'B069_PottersMarket', playerId: state.players[1]!.id, round: 7, resources: { vegetable: 2 } },
    ]
    expect((await request.post(`${BACKEND_URL}/api/game/load`, { data: { state } })).ok()).toBe(true)
    await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
    const anytime = page.locator('.anytime-bar button').filter({ hasText: scenario.locale === 'en' ? 'Whisky Distiller' : '威士忌蒸馏师' })
    await expect(anytime).toHaveCount(1)
    await expect(anytime.locator('[data-resource="food"]')).toHaveAttribute('data-amount', '4')
    await expect(anytime.locator('[data-resource="grain"]')).toHaveAttribute('data-amount', '1')
    await expect(anytime).toContainText(scenario.locale === 'en' ? 'Round 7' : '第 7 回合')
    for (let index = 0; index < 2; index++) {
      const response = page.waitForResponse(result => result.url().endsWith('/api/game/anytime'))
      await anytime.click()
      expect((await (await response).json()).ok).toBe(true)
    }
    const plans = page.locator('.future-meeple-holder').filter({ has: page.locator('[data-source-card="D106_WhiskyDistiller"]') })
    await expect(plans).toHaveCount(1)
    await expect(plans.locator('[data-owner-player="p1"]')).toHaveAttribute('data-player-color', 'red')
    await expect(plans.locator('[data-owner-player="p2"]')).toHaveAttribute('data-player-color', 'blue')
    await expect(plans.locator('[data-source-card="D106_WhiskyDistiller"] [data-resource="food"]')).toHaveAttribute('data-amount', '8')
    await expect(plans.locator('[data-source-card="A074_StableTree"]')).toHaveCount(1)
    await plans.getByRole('button').click({ timeout: 10000 })
    const dialog = page.getByRole('dialog', { name: scenario.locale === 'en' ? 'Scheduled effects' : '已安排效果' })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('[data-player-color="red"] li')).toHaveCount(2)
    await expect(dialog.locator('[data-player-color="blue"] li')).toHaveCount(1)
    await expect(dialog.locator('[data-resource="food"]')).toHaveAttribute('data-amount', '4')
    await expect(dialog).toContainText('×2')
    const bounds = await dialog.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(scenario.width)
    await expect(page.locator('.public-event-notification')).toHaveCount(0, { timeout: 15000 })
    await page.screenshot({ path: `output/playwright/rule-derived-schedules-${scenario.locale}.png` })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(plans.getByRole('button')).toBeFocused()
    const final = await (await request.get(`${BACKEND_URL}/api/game/state`)).json()
    expect(final.state.players[0].resources.grain).toBe(0)
    expect(final.state.players[0].resources.food).toBe(20)
    expect(final.state.futureMeeples.filter((entry: { cardId: string }) => entry.cardId === 'D106_WhiskyDistiller')).toHaveLength(2)
  })
}

test('dense schedules keep six player colors separated on a narrow board', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'zh'))
  // Six players are intentional here: this verifies every supported player color.
  const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, { data: { seed: 6117, playerCount: 6, customCardIds: [] } })
  expect(fresh.ok()).toBe(true)
  const { state } = await fresh.json() as { state: SerializedGameState }
  state.round = 5
  const colors = ['red', 'blue', 'green', 'yellow', 'black', 'purple'] as const
  state.futureMeeples = []
  for (const [index, player] of state.players.entries()) {
    player.color = colors[index]!
    player.name = `玩家${index + 1}${'长名字'.repeat(12)}`
    player.nameIsDefault = false
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.occupationPlayed = ['D106_WhiskyDistiller']
    player.minorPlayed = ['A074_StableTree']
    for (let occurrence = 0; occurrence < 12; occurrence++) state.futureMeeples.push({ id: `dense-${index}-${occurrence}`, cardId: 'D106_WhiskyDistiller', playerId: player.id, round: 7, resources: { food: 4 } })
    state.futureMeeples.push({ id: `wood-${index}`, cardId: 'A074_StableTree', playerId: player.id, round: 7, resources: { wood: 1234 } })
  }
  expect((await request.post(`${BACKEND_URL}/api/game/load`, { data: { state } })).ok()).toBe(true)
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  const plans = page.locator('.future-meeple-holder').filter({ has: page.locator('[data-source-card="D106_WhiskyDistiller"]') })
  await expect(plans).toHaveCount(1)
  await expect(plans.locator('.future-effect-owner')).toHaveCount(6)
  for (const color of colors) {
    const owner = plans.locator(`[data-player-color="${color}"]`)
    await expect(owner.locator('.future-effect-marker')).toHaveCount(2)
    await expect(owner.locator('[data-resource="food"]')).toHaveAttribute('data-amount', '48')
    await expect(owner.locator('[data-resource="wood"]')).toHaveAttribute('data-amount', '1234')
  }
  await plans.getByRole('button').click({ timeout: 10000 })
  const dialog = page.getByRole('dialog', { name: '已安排效果' })
  await expect(dialog.locator('section')).toHaveCount(6)
  await expect(dialog.locator('li')).toHaveCount(12)
  await expect(dialog).toContainText('×12')
  const bounds = await dialog.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: 'output/playwright/rule-derived-schedules-six-colors.png' })
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: '关闭' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(plans.getByRole('button')).toBeFocused()
})

test('baking uses authoritative prices and quantities for the interaction player', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, { data: { seed: 42, playerCount: 2, customCardIds: [] } })
  const { state } = await fresh.json() as { state: SerializedGameState }
  state.players.forEach(player => { player.minorHand = ['__test_placeholder__']; player.occupationHand = ['__test_placeholder__'] })
  state.players[0]!.improvements = ['Major_Fireplace1', 'Major_ClayOven']
  Object.assign(state.players[0]!.resources, { grain: 2, food: 0 })
  state.players[1]!.improvements = ['Major_StoneOven']
  Object.assign(state.players[1]!.resources, { grain: 9, food: 20 })
  expect((await request.post(`${BACKEND_URL}/api/game/load`, { data: { state } })).ok()).toBe(true)
  const action = await request.post(`${BACKEND_URL}/api/game/action`, { data: { playerIndex: 0, spaceId: 'grain-utilization' } })
  expect((await action.json()).ok).toBe(true)
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  const oven = page.locator('.exchange-row').filter({ hasText: 'Clay Oven' })
  const fireplace = page.locator('.exchange-row').filter({ hasText: 'Fireplace' })
  await expect(oven).toHaveCount(1)
  await expect(oven.locator('.exchange-rate')).toContainText('5')
  await expect(fireplace.locator('.exchange-rate')).toContainText('2')
  await expect(page.locator('.exchange-row').filter({ hasText: 'Stone Oven' })).toHaveCount(0)
  await oven.getByRole('button', { name: '+', exact: true }).click()
  await expect(oven.getByRole('button', { name: '+', exact: true })).toBeDisabled()
  await fireplace.getByRole('button', { name: '+', exact: true }).click()
  const payment = page.waitForResponse(result => result.url().endsWith('/api/game/choice'))
  await page.locator('.exchange-confirm').click()
  await payment
  await expect(page.locator('.exchange-overlay')).toHaveCount(0)
  const final = await (await request.get(`${BACKEND_URL}/api/game/state`)).json()
  expect(final.state.players[0].resources).toMatchObject({ food: 7, grain: 0 })
  expect(final.state.players[1].resources).toMatchObject({ food: 20, grain: 9 })
})

test('declared timed resource formulas show exact fixed quantities on their future round', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'zh'))
  const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, { data: { seed: 2424, playerCount: 2, enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true, customCardIds: [] } })
  expect(fresh.ok()).toBe(true)
  const { state } = await fresh.json() as { state: SerializedGameState }
  state.round = 5
  state.players.forEach(player => { player.minorHand = ['__test_placeholder__']; player.occupationHand = ['__test_placeholder__'] })
  state.players[0]!.minorPlayed = ['M128_Workbench']
  state.players[0]!.color = 'red'
  expect((await request.post(`${BACKEND_URL}/api/game/load`, { data: { state } })).ok()).toBe(true)
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  const plans = page.locator('.future-meeple-holder').filter({ has: page.locator('[data-source-card="M128_Workbench"]') })
  await expect(plans).toHaveCount(2)
  for (const [resource, amount] of [['wood', '3'], ['clay', '2'], ['reed', '1']] as const) await expect(plans.first().locator(`[data-resource="${resource}"]`)).toHaveAttribute('data-amount', amount)
  await plans.first().getByRole('button').click({ timeout: 10000 })
  const dialog = page.getByRole('dialog', { name: '已安排效果' })
  await expect(dialog.locator('[data-player-color="red"] li')).toHaveCount(1)
  await expect(dialog).toContainText('田地阶段')
  await page.screenshot({ path: 'output/playwright/rule-derived-fixed-timed-resources.png' })
})
