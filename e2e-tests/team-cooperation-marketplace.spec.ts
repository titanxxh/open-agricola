// @covers client/app/TeamSetupFields.tsx
// @covers client/app/LobbyPage.tsx
// @covers client/app/GameContainerApi.tsx
// @covers client/components/board/
// @covers client/components/interaction/
// @covers client/styles/pages/
import { expect, test, type Browser, type BrowserContext } from '@playwright/test'
import type { SessionResponse } from '../server/game/authoritative-session'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import type { TeamConfiguration } from '../shared/contract/team'
import { serializeState } from '../shared/session/serialization'
import { BACKEND_URL, FRONTEND_URL } from './fixtures'
import { authenticateTeamAccount } from './helpers/team-account'

const variants = [
  { name: 'desktop-en', locale: 'en', width: 1280, height: 900 },
  { name: 'mobile-zh', locale: 'zh', width: 390, height: 844 },
] satisfies Array<{ name: string; locale: 'en' | 'zh'; width: number; height: number }>

const labelsFor = (locale: 'en' | 'zh') => locale === 'en' ? {
  team: 'Team game', multihand: 'Multihand game', create: 'Create Game', scoring: 'Team scoring',
  cooperation: 'Official cooperation rules', enabled: 'Cooperation rules on', badge: 'Cooperation rules',
  direction: 'Direction', teammate: 'Teammate', quantity: 'Quantity', confirm: 'Confirm transfers',
  woodTax: /Builder pays.*3.*1.*tax/, foodTax: /Partner pays.*2.*1.*tax/,
  woodLog: /Builder gives Partner.*3.*1.*extra/, foodLog: /Partner gives Builder.*2.*1.*extra/,
} : {
  team: '组队模式', multihand: '分身模式', create: '创建游戏', scoring: '队伍计分',
  cooperation: '官方协作规则', enabled: '协作规则已开启', badge: '协作规则',
  direction: '方向', teammate: '队友', quantity: '数量', confirm: '确认转移',
  woodTax: /Builder 支付.*3.*1.*税/, foodTax: /Partner 支付.*2.*1.*税/,
  woodLog: /Builder.*Partner.*3.*1/, foodLog: /Partner.*Builder.*2.*1/,
}

async function account(browser: Browser, variant: typeof variants[number], suffix: string, displayName: string) {
  const context = await browser.newContext({
    viewport: { width: variant.width, height: variant.height },
    ...(variant.locale === 'zh' ? { isMobile: true, hasTouch: true } : {}),
  })
  try {
    await context.addInitScript(locale => localStorage.setItem('open-agricola-locale-v2', locale), variant.locale)
    await authenticateTeamAccount(context, `co_${Date.now().toString(36)}${suffix}`, displayName)
    return context
  } catch (error) {
    await context.close()
    throw error
  }
}

async function loadMarketplace(context: BrowserContext, cooperationRules: boolean) {
  const teamConfig = {
    mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum',
    teammateVisibility: 'private', cooperationRules,
  } satisfies TeamConfiguration
  const fresh = await context.request.post(`${BACKEND_URL}/api/game/new-sandbox`, {
    data: { seed: 1624, playerCount: 4, teamConfig, customCardIds: [] },
  })
  expect(fresh.ok(), await fresh.text()).toBe(true)
  const session = createWorkSession({ seed: 1624, options: { playerCount: 4, teamConfig }, configure(state) {
    state.currentPlayerIndex = 0
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0,
        food: 0, sheep: 0, boar: 0, cattle: 0 })
    }
    state.players[0]!.name = 'Builder'
    state.players[2]!.name = 'Partner'
    Object.assign(state.players[0]!.resources, { wood: 6, food: 1 })
    Object.assign(state.players[2]!.resources, { wood: 0, food: 5 })
  } })
  try {
    const loaded = await context.request.post(`${BACKEND_URL}/api/game/load`, {
      data: { state: session.withCtx(() => serializeState(session.state, {})) },
    })
    expect(loaded.ok(), await loaded.text()).toBe(true)
  } finally { session.dispose() }
}

for (const variant of variants) {
  const labels = labelsFor(variant.locale)
  for (const mode of ['team', 'multihand'] satisfies Array<TeamConfiguration['mode']>) {
    test(`${mode} cooperation setup defaults off and preserves the switch in the room summary (${variant.name})`, async ({ browser }, testInfo) => {
      const contexts: BrowserContext[] = []
      try {
        const context = await account(browser, variant, `${mode[0]}h`, 'Cooperation Host')
        contexts.push(context)
        const page = await context.newPage()
        await page.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded' })
        await page.getByRole('button', { name: labels[mode], exact: true }).click()
        const cooperation = page.getByRole('checkbox', { name: labels.cooperation, exact: true })
        await expect(cooperation).toBeVisible()
        await expect(cooperation).not.toBeChecked()
        await expect(page.getByRole('combobox', { name: labels.scoring })).toHaveValue('category-min')
        await page.getByRole('combobox', { name: labels.scoring }).selectOption('sum')
        await cooperation.check()
        const counts = page.locator('.player-select-options').first().getByRole('button')
        await counts.nth(1).click()
        await expect(cooperation).toBeChecked()
        await counts.nth(0).click()
        await expect(cooperation).toBeChecked()
        await expect(page.getByRole('combobox', { name: labels.scoring })).toHaveValue('sum')
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
        await page.screenshot({ path: testInfo.outputPath('cooperation-setup.png'), fullPage: true })
        await page.getByRole('button', { name: labels.create, exact: true }).click()
        await expect(page.locator('.team-waiting-room')).toBeVisible()
        await expect(page.locator('.team-waiting-room .team-config-summary')).toContainText(labels.enabled)
        const roomId = await page.locator('.ws-invite-roomid strong').textContent()
        if (!roomId) throw new Error('Missing cooperation room id')
        await page.reload()
        await expect(page.locator('.team-waiting-room .team-config-summary')).toContainText(labels.enabled)

        const observer = await account(browser, variant, `${mode[0]}o`, 'Cooperation Observer')
        contexts.push(observer)
        const listing: { rooms: Array<{ id: string; teamConfig?: TeamConfiguration }> } =
          await (await observer.request.get(`${BACKEND_URL}/api/rooms`)).json()
        expect(listing.rooms.find(room => room.id === roomId)?.teamConfig).toMatchObject({
          mode, seatsPerTeam: 2, scoring: 'sum', cooperationRules: true,
        })
        const lobby = await observer.newPage()
        await lobby.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded' })
        await expect(lobby.locator('.room-item').filter({ hasText: roomId }).locator('.team-config-summary'))
          .toContainText(labels.enabled)
        await page.screenshot({ path: testInfo.outputPath('cooperation-waiting-room.png'), fullPage: true })
      } finally { for (const context of contexts) await context.close() }
    })
  }

  test(`Marketplace edits both transfer directions, previews each tax and restores pending on reload (${variant.name})`, async ({ browser }, testInfo) => {
    const context = await account(browser, variant, 'market', 'Marketplace Player')
    try {
      await loadMarketplace(context, true)
      const page = await context.newPage()
      await page.goto(`${FRONTEND_URL}/?page=game&player=p1&embedded=1&devMode=1`)
      await expect(page.getByTestId('team-cooperation-rules')).toContainText(labels.enabled)
      const marketplace = page.locator('[data-action-id="marketplace"]')
      await expect(marketplace.locator('.team-cooperation-badge')).toHaveText(labels.badge)
      const button = marketplace.getByRole('button').first()
      await expect(button).toBeEnabled()
      const started = page.waitForResponse(response => response.url().endsWith('/api/game/action'))
      await button.click()
      const pending: SessionResponse = await (await started).json()
      expect(pending.ok).toBe(true)
      expect(pending.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: {
        kind: 'marketplace-select', teammates: [{ playerId: 'p3', name: 'Partner' }],
      } })
      const panel = page.locator('.marketplace-panel')
      await expect(panel).toBeVisible()
      const confirm = panel.getByRole('button', { name: labels.confirm, exact: true })
      await expect(confirm).toBeDisabled()
      await page.reload()
      await expect(panel).toBeVisible()
      await expect(confirm).toBeDisabled()
      const restored: SessionResponse = await (await context.request.get(`${BACKEND_URL}/api/game/state`)).json()
      expect(restored.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'marketplace-select' } })
      expect(restored.state.players[0]!.resources).toMatchObject({ wood: 6, food: 1 })
      expect(restored.state.players[2]!.resources).toMatchObject({ wood: 0, food: 5 })

      const wood = panel.locator('[data-marketplace-resource="wood"]')
      const food = panel.locator('[data-marketplace-resource="food"]')
      await wood.getByRole('combobox', { name: labels.direction, exact: true }).selectOption('give')
      await wood.getByRole('combobox', { name: labels.teammate, exact: true }).selectOption('p3')
      await wood.getByRole('spinbutton', { name: labels.quantity, exact: true }).fill('6')
      await expect(confirm).toBeDisabled()
      await wood.getByRole('spinbutton', { name: labels.quantity, exact: true }).fill('3')
      await expect(confirm).toBeEnabled()
      await food.getByRole('combobox', { name: labels.direction, exact: true }).selectOption('take')
      await food.getByRole('combobox', { name: labels.teammate, exact: true }).selectOption('p3')
      await food.getByRole('spinbutton', { name: labels.quantity, exact: true }).fill('5')
      await expect(confirm).toBeDisabled()
      await food.getByRole('spinbutton', { name: labels.quantity, exact: true }).fill('2')
      await expect(confirm).toBeEnabled()
      await expect(wood.locator('.marketplace-tax')).toContainText(labels.woodTax)
      await expect(food.locator('.marketplace-tax')).toContainText(labels.foodTax)
      expect(await panel.evaluate(element => element.getBoundingClientRect().right - innerWidth)).toBeLessThanOrEqual(1)
      await page.screenshot({ path: testInfo.outputPath('marketplace-tax-preview.png'), fullPage: true })
      const submitted = page.waitForResponse(response => response.url().endsWith('/api/game/commit-selection'))
      await confirm.click()
      const result: SessionResponse = await (await submitted).json()
      expect(result.ok).toBe(true)
      expect(result.state.players[0]!.resources).toMatchObject({ wood: 2, food: 3 })
      expect(result.state.players[2]!.resources).toMatchObject({ wood: 3, food: 2 })
      for (const index of [1, 3]) expect(result.state.players[index]!.resources).toMatchObject({ wood: 0, food: 0 })
      expect(result.state.actionSpaces.find(space => space.id === 'marketplace')?.takenBy).toHaveLength(1)
      const logs = result.state.log.filter(entry => entry.key === 'log.marketplaceTransfer')
      expect(logs).toHaveLength(2)
      expect(logs).toEqual(expect.arrayContaining([
        expect.objectContaining({ playerId: 'p1', playerRefs: { giver: 'p1', receiver: 'p3' }, params: expect.objectContaining({ goods: { wood: 3 }, tax: { wood: 1 } }) }),
        expect.objectContaining({ playerId: 'p3', playerRefs: { giver: 'p3', receiver: 'p1' }, params: expect.objectContaining({ goods: { food: 2 }, tax: { food: 1 } }) }),
      ]))
      await expect(panel).toHaveCount(0)
      await expect(page.locator('.action-log__text').filter({ hasText: labels.woodLog })).toHaveCount(1)
      await expect(page.locator('.action-log__text').filter({ hasText: labels.foodLog })).toHaveCount(1)
      await testInfo.attach('marketplace-authoritative-result', {
        body: JSON.stringify({ players: result.state.players.map(({ id, resources }) => ({ id, resources })), logs }),
        contentType: 'application/json',
      })
      await page.screenshot({ path: testInfo.outputPath('marketplace-completed.png'), fullPage: true })
    } finally { await context.close() }
  })

  test(`disabled cooperation keeps the Marketplace off the board (${variant.name})`, async ({ browser }) => {
    const context = await account(browser, variant, 'off', 'Ordinary Team Player')
    try {
      await loadMarketplace(context, false)
      const page = await context.newPage()
      await page.goto(`${FRONTEND_URL}/?page=game&player=p1&embedded=1&devMode=1`)
      await expect(page.locator('.game-layout')).toBeVisible()
      await expect(page.locator('[data-action-id="marketplace"]')).toHaveCount(0)
      const state: SessionResponse = await (await context.request.get(`${BACKEND_URL}/api/game/state`)).json()
      expect(state.state.team?.configuration.cooperationRules).toBe(false)
      expect(state.state.actionSpaces.some(space => space.id === 'marketplace')).toBe(false)
    } finally { await context.close() }
  })
}
