import { expect, test } from '@playwright/test'
import { BACKEND_URL, FRONTEND_URL, getJson, postJson } from './fixtures'

test.describe('Expansion display', () => {
  for (const locale of ['zh', 'en'] as const) {
    test(`${locale} keeps six default player names on two equal rows`, async ({ page, request }) => {
      await page.addInitScript((value) => {
        localStorage.setItem('open-agricola-locale-v2', value)
      }, locale)
      await postJson(request, `${BACKEND_URL}/api/game/new`, { seed: 933, maxPlayers: 6 })
      const { state } = await getJson(request, `${BACKEND_URL}/api/game/state`)
      state.phase = 'playing'
      state.currentPlayerIndex = 0
      state.players.forEach((player: { name: string; minorHand: string[]; occupationHand: string[] }, index: number) => {
        player.name = `Player ${index + 1}`
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
      })
      expect((await postJson(request, `${BACKEND_URL}/api/game/load`, { state })).ok).toBe(true)
      await page.goto(`${FRONTEND_URL}/?page=game&player=p1&embedded=1&devMode=1`)
      const tabs = page.locator('.player-tabs--many .player-tabs__tab')
      await expect(tabs).toHaveCount(6)
      const boxes = await tabs.evaluateAll((elements) => elements.map((element) => {
        const box = element.getBoundingClientRect()
        const name = element.querySelector('.player-tabs__name')!
        return { top: box.top, width: box.width, whiteSpace: getComputedStyle(name).whiteSpace }
      }))
      expect(new Set(boxes.map((box) => Math.round(box.top))).size).toBe(2)
      expect(boxes.slice(0, 3).every((box) => box.top === boxes[0].top)).toBe(true)
      expect(boxes.slice(3).every((box) => box.top === boxes[3].top)).toBe(true)
      expect(Math.max(...boxes.map((box) => box.width)) - Math.min(...boxes.map((box) => box.width))).toBeLessThan(1)
      expect(boxes.every((box) => box.whiteSpace === 'nowrap')).toBe(true)
      for (let index = 0; index < 6; index++) {
        await expect(tabs.nth(index)).toContainText(`${locale === 'zh' ? '玩家' : 'Player'} ${index + 1}`)
      }
      if (locale === 'zh') await expect(page.locator('.game-layout')).not.toContainText(/Player \d/)
      await page.getByRole('button', { name: locale === 'zh' ? '计分板' : 'Scoring Pad', exact: true }).click()
      await expect(page.locator('.scoring-pad .scoring-player-name').last())
        .toHaveText(`${locale === 'zh' ? '玩家' : 'Player'} 6`)
    })

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
