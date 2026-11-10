// @covers client/app/GameContainerApi.tsx
// @covers client/components/interaction/InteractionBar.tsx
// @covers client/app/fence-selection-quote.ts
// @covers client/components/board/
import { CLIENT_CAPABILITIES_HEADER, TEAM_COOPERATION_CAPABILITY } from '../shared/contract/client-capabilities'
import { expect, test } from '@playwright/test'
import type { SessionResponse } from '../server/game/authoritative-session'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import type { TeamConfiguration } from '../shared/contract/team'
import { serializeState } from '../shared/session/serialization'
import { BACKEND_URL, FRONTEND_URL } from './fixtures'
import { authenticateTeamAccount } from './helpers/team-account'

for (const variant of [
  { locale: 'en', width: 1280, height: 900, own: 'Your farm', partner: "Partner's farm", choose: 'Build on this farm', confirm: 'Confirm fences' },
  { locale: 'zh', width: 390, height: 844, own: '自己的农场', partner: 'Partner 的农场', choose: '在此农场建造', confirm: '确认围栏' },
]) {
  test(`builder places paid fences on the selected teammate farm (${variant.locale})`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: { width: variant.width, height: variant.height } })
    try {
      await context.addInitScript(locale => localStorage.setItem('open-agricola-locale-v2', locale), variant.locale)
      await authenticateTeamAccount(context, `build_${Date.now().toString(36)}${variant.locale}`, 'Builder')
      const teamConfig = { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'private', cooperationRules: true } satisfies TeamConfiguration
      const fresh = await context.request.post(`${BACKEND_URL}/api/game/new-sandbox`, { headers: { [CLIENT_CAPABILITIES_HEADER]: TEAM_COOPERATION_CAPABILITY }, data: { seed: 1629, playerCount: 4, teamConfig, customCardIds: [] } })
      expect(fresh.ok(), await fresh.text()).toBe(true)
      const session = createWorkSession({ seed: 1629, options: { playerCount: 4, teamConfig }, configure(state) {
        state.round = 14; state.currentPlayerIndex = 0
        for (const player of state.players) {
          player.minorPlayed = []; player.occupationPlayed = []; player.cardStates = {}
          Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
        }
        state.players[0]!.name = 'Builder'; state.players[0]!.nameIsDefault = false
        state.players[2]!.name = 'Partner'; state.players[2]!.nameIsDefault = false
        state.players[0]!.resources.wood = 6
      } })
      try {
        const loaded = await context.request.post(`${BACKEND_URL}/api/game/load`, { headers: { [CLIENT_CAPABILITIES_HEADER]: TEAM_COOPERATION_CAPABILITY }, data: { state: session.withCtx(() => serializeState(session.state, {})) } })
        expect(loaded.ok(), await loaded.text()).toBe(true)
      } finally { session.dispose() }
      const page = await context.newPage()
      await page.goto(`${FRONTEND_URL}/?page=game&player=p1&embedded=1&devMode=1`)
      await page.locator('[data-action-id="fencing"]').getByRole('button').first().click()
      const own = page.getByRole('radio', { name: variant.own, exact: true })
      await expect(own).toBeChecked()
      await page.getByRole('radio', { name: variant.partner, exact: true }).click()
      const selected = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
      await page.getByRole('button', { name: variant.choose, exact: true }).click()
      const bound: SessionResponse = await (await selected).json()
      expect(bound.ok, bound.error).toBe(true)
      expect(bound.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select', farmOwnerPlayerId: 'p3' } })
      const target = page.locator('[data-fence-player="p3"][data-fence-edge="H-0-0"] button')
      await expect(target).toBeVisible()
      await expect(page.locator('[data-hand-anchor="p1"]')).toBeVisible()
      await expect(page.locator('[data-hand-anchor="p3"]')).toHaveCount(0)
      await expect(page.locator('[data-fence-player="p1"].selectable')).toHaveCount(0)
      await page.reload()
      await expect(target).toBeVisible()
      for (const edge of ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']) {
        await page.locator(`[data-fence-player="p3"][data-fence-edge="${edge}"] button`).click()
      }
      await expect(page.getByTestId('fence-selection-cost')).toHaveText(variant.locale === 'en' ? 'Cost: 6 wood' : '费用：6 木头')
      await page.screenshot({ path: testInfo.outputPath('partner-fence-target.png'), fullPage: false })
      const submitted = page.waitForResponse(response => response.url().endsWith('/api/game/commit-selection'))
      await page.locator('.interaction-bar').getByRole('button', { name: variant.confirm, exact: true }).click()
      const result: SessionResponse = await (await submitted).json()
      expect(result.ok, result.error).toBe(true)
      expect(result.state.players[0]!.resources.wood).toBe(0)
      expect(result.state.players[0]!.fenceSegments).toEqual([])
      expect(result.state.players[2]!.fenceSegments).toHaveLength(4)
      expect(result.state.players[2]!.resources.wood).toBe(0)
      expect(result.state.players[2]!.pastures).toMatchObject([{ tiles: [{ row: 0, col: 0 }] }])
      expect(result.state.log.filter(entry => entry.key === 'log.partnerFencesBuilt')).toHaveLength(1)
      await expect(page.locator('.action-log__text').filter({ hasText: variant.locale === 'en' ? /Builder builds 4 fences for Partner/ : /Builder 替 Partner 建了 4 段围栏/ })).toHaveCount(1)
      await page.screenshot({ path: testInfo.outputPath('partner-fence-completed.png'), fullPage: false })
      await testInfo.attach('partner-fence-result', { body: JSON.stringify({ players: result.state.players, log: result.state.log }), contentType: 'application/json' })
    } finally { await context.close() }
  })
}
