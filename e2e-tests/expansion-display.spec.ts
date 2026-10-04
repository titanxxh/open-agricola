import { expect, test } from '@playwright/test'
import { BACKEND_URL, FRONTEND_URL, getJson, postJson } from './fixtures'

test.describe('Expansion display', () => {
  for (const locale of ['zh', 'en'] as const) {
    test(`${locale} localizes the lobby expansion toggles`, async ({ page }) => {
      await page.addInitScript((value) => {
        localStorage.setItem('open-agricola-locale-v2', value)
      }, locale)
      await page.goto(`${FRONTEND_URL}/?page=lobby&player=p1&devMode=1`)
      await page.getByRole('button', { name: locale === 'zh' ? '创建多人游戏' : 'Create Multiplayer Game' }).click()
      await expect(page.getByRole('checkbox', { name: locale === 'zh'
        ? '启用父母卡扩展' : 'Enable Parent Cards expansion', exact: true })).toBeVisible()
      await expect(page.getByRole('checkbox', { name: locale === 'zh'
        ? '启用四季扩展' : 'Enable Through the Seasons expansion', exact: true })).toBeVisible()
      await page.getByRole('checkbox', { name: locale === 'zh'
        ? '启用沼泽农夫扩展' : 'Enable Farmers of the Moor expansion', exact: true }).check()
      await expect(page.getByRole('checkbox', { name: locale === 'zh'
        ? '允许沼泽农夫小改良池不完整' : 'Allow an incomplete Farmers of the Moor minor improvement pool', exact: true })).toBeVisible()
    })

    test(`${locale} displays winter clay, localized parent rules and clean fractional scores`, async ({ page, request }) => {
      await page.addInitScript((value) => {
        localStorage.setItem('open-agricola-locale-v2', value)
      }, locale)
      await postJson(request, `${BACKEND_URL}/api/game/new`, {
        seed: 56124,
        maxPlayers: 2,
        enableParentCards: true,
        enableThroughTheSeasons: true,
      })
      const { state } = await getJson(request, `${BACKEND_URL}/api/game/state`)
      state.phase = 'playing'
      state.currentPlayerIndex = 0
      state.parentSelection = null
      for (const player of state.players) {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
      }
      const first = state.players[0]
      first.parentCards = { mother: 'PR04', father: 'PS08' }
      // A prepared score combines a printed parent fraction and an earned bonus.
      first.workers[1].isActive = false
      first.cardStates.__test_bonus__ = { counters: { bonusVp: 1 } }
      state.players[1].parentCards = { mother: 'PR01', father: 'PS01' }
      await postJson(request, `${BACKEND_URL}/api/game/load`, { state })
      const loaded = await getJson(request, `${BACKEND_URL}/api/game/state`)
      expect(loaded.scores[0].total).toBe(-15.899999999999999)
      expect(loaded.scores[1].total).toBe(-14.75)

      await page.goto(`${FRONTEND_URL}/?page=game&player=p1&embedded=1&devMode=1`)
      await expect(page.locator('.game-layout')).toBeVisible()
      const winter = page.locator('.seasons-board__resource-adjustment--winter-basic')
      await expect(winter.locator('.res-icon-clay')).toHaveCount(1)
      await expect(winter.locator('.res-icon-reed')).toHaveCount(1)
      await expect(winter.locator('.res-icon-wood')).toHaveCount(0)
      await expect(page.locator('.player-tabs__score').first()).toHaveText('-15.9')
      await expect(page.locator('.player-tabs__score').nth(1)).toHaveText('-14.75')

      const father = page.locator('.parent-card-face--father').first()
      await expect(father).toContainText(locale === 'zh'
        ? '至多 7 / 5 / 3 个未使用农场格'
        : 'at most 7 / 5 / 3 unused farmyard spaces left')
      await expect(page.locator('.parent-card-face--mother').first()).toContainText(locale === 'zh'
        ? '在第 7 回合格上放置 1 野猪'
        : 'Place 1 wild boar on round space 7')

      await page.getByRole('button', { name: locale === 'zh' ? '计分板' : 'Scoring Pad', exact: true }).click()
      const pad = page.locator('.scoring-pad')
      await expect(pad).toBeVisible()
      await expect(pad.getByText('-15.9', { exact: true })).toBeVisible()
      await expect(pad.getByText('-14.75', { exact: true })).toBeVisible()
      await expect(pad.getByText('-0.75', { exact: true }).first()).toBeVisible()
      await expect(page.locator('body')).not.toContainText('-15.899999999999999')
      await pad.getByRole('button', { name: locale === 'zh' ? '关闭' : 'Close', exact: true }).click()
      await page.setViewportSize({ width: 390, height: 844 })
      await expect(page.locator('.player-tabs__select .select-button__label')).toContainText('-15.9')
      await expect(page.locator('.player-tabs__select')).not.toContainText('-15.899999999999999')
    })
  }
})
