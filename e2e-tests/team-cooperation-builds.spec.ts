// @covers client/app/GameContainerApi.tsx
// @covers client/components/interaction/InteractionBar.tsx
// @covers client/components/board/
import { expect, test } from '@playwright/test'
import type { SessionResponse } from '../server/game/authoritative-session'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import type { TeamConfiguration } from '../shared/contract/team'
import { serializeState } from '../shared/session/serialization'
import { BACKEND_URL, FRONTEND_URL } from './fixtures'
import { authenticateTeamAccount } from './helpers/team-account'

for (const variant of [
  { locale: 'en', width: 1280, height: 900, own: 'Your farm', partner: "Partner's farm", choose: 'Build on this farm', confirm: 'Confirm stables' },
  { locale: 'zh', width: 390, height: 844, own: '自己的农场', partner: 'Partner 的农场', choose: '在此农场建造', confirm: '确认建造' },
]) {
  test(`builder places a paid stable on the selected teammate farm (${variant.locale})`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: { width: variant.width, height: variant.height } })
    try {
      await context.addInitScript(locale => localStorage.setItem('open-agricola-locale-v2', locale), variant.locale)
      await authenticateTeamAccount(context, `build_${Date.now().toString(36)}${variant.locale}`, 'Builder')
      const teamConfig = { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'private', cooperationRules: true } satisfies TeamConfiguration
      const fresh = await context.request.post(`${BACKEND_URL}/api/game/new-sandbox`, { data: { seed: 1627, playerCount: 4, teamConfig, customCardIds: [] } })
      expect(fresh.ok(), await fresh.text()).toBe(true)
      const session = createWorkSession({ seed: 1627, options: { playerCount: 4, teamConfig }, configure(state) {
        state.currentPlayerIndex = 0
        for (const player of state.players) {
          player.minorPlayed = []; player.occupationPlayed = []; player.cardStates = {}
          Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
        }
        state.players[0]!.name = 'Builder'; state.players[0]!.nameIsDefault = false
        state.players[2]!.name = 'Partner'; state.players[2]!.nameIsDefault = false
        state.players[0]!.resources.wood = 3
      } })
      try {
        const loaded = await context.request.post(`${BACKEND_URL}/api/game/load`, { data: { state: session.withCtx(() => serializeState(session.state, {})) } })
        expect(loaded.ok(), await loaded.text()).toBe(true)
      } finally { session.dispose() }
      const page = await context.newPage()
      await page.goto(`${FRONTEND_URL}/?page=game&player=p1&embedded=1&devMode=1`)
      await page.locator('[data-action-id="farm-expansion"]').getByRole('button').first().click()
      const own = page.getByRole('radio', { name: variant.own, exact: true })
      await expect(own).toBeChecked()
      await page.getByRole('radio', { name: variant.partner, exact: true }).click()
      const selected = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
      await page.getByRole('button', { name: variant.choose, exact: true }).click()
      const bound: SessionResponse = await (await selected).json()
      expect(bound.ok, bound.error).toBe(true)
      expect(bound.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select', farmOwnerPlayerId: 'p3' } })
      const target = page.locator('[data-farm-tile-player="p3"][data-farm-tile-key="0-2"].stable-selectable')
      await expect(target).toBeVisible()
      await expect(page.locator('[data-hand-anchor="p1"]')).toBeVisible()
      await expect(page.locator('[data-hand-anchor="p3"]')).toHaveCount(0)
      await expect(page.locator('[data-farm-tile-player="p1"].stable-selectable')).toHaveCount(0)
      await page.reload()
      await expect(target).toBeVisible()
      await target.click()
      await page.screenshot({ path: testInfo.outputPath('partner-stable-target.png'), fullPage: false })
      const submitted = page.waitForResponse(response => response.url().endsWith('/api/game/commit-selection'))
      await page.locator('.interaction-bar').getByRole('button', { name: variant.confirm, exact: true }).click()
      const result: SessionResponse = await (await submitted).json()
      expect(result.ok, result.error).toBe(true)
      expect(result.state.players[0]!.resources.wood).toBe(0)
      expect(result.state.players[0]!.stableTiles).toEqual([])
      expect(result.state.players[2]!.stableTiles).toEqual([{ row: 0, col: 2 }])
      expect(result.state.log.filter(entry => entry.key === 'log.partnerStablesBuilt')).toHaveLength(1)
      await expect(page.locator('.action-log__text').filter({ hasText: variant.locale === 'en' ? /Builder builds 1 stables for Partner/ : /Builder 替 Partner 建了 1 个畜栏/ })).toHaveCount(1)
      await page.screenshot({ path: testInfo.outputPath('partner-stable-completed.png'), fullPage: false })
      await testInfo.attach('partner-stable-result', { body: JSON.stringify({ players: result.state.players, log: result.state.log }), contentType: 'application/json' })
    } finally { await context.close() }
  })
}
