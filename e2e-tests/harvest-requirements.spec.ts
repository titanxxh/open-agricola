// @covers client/components/board/
// @covers shared/session/harvest-requirements.ts
import { expect, test } from '@playwright/test'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { setActiveWorkerCount, setNewbornCount } from '../shared/domain/player'
import { writeCardExtraData } from '../shared/cards/helpers/card-state'
import { serializeState } from '../shared/session/serialization'
import { joinRoomClients, roomDriver } from './room-command-driver'

test.describe.configure({ mode: 'serial' })

for (const locale of ['en', 'zh'] as const) {
  test(`resource panels show synchronized harvest needs on desktop and mobile in ${locale}`, async ({ browser, request }, testInfo) => {
    const pages = [await browser.newPage(), await browser.newPage()]
    try {
      await joinRoomClients(pages, request, locale)
      const driver = roomDriver(pages)
      const fixture = createWorkSession({ seed: 5421, options: {
        enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true,
      }, configure(state) {
        state.round = 3
        setActiveWorkerCount(state.players[0]!, 3)
        setNewbornCount(state.players[0]!, 1)
        state.players[0]!.minorPlayed = ['M086_SpinningMill']
        writeCardExtraData(state.players[0]!, 'M086_SpinningMill', 'heatingRoomDiscount', 2)
        state.players[1]!.houseType = 'clay'
      } })
      const initial = fixture.withCtx(() => serializeState(fixture.state, {}))
      fixture.dispose()
      await driver.command(0, { type: 'loadGame', state: initial })
      const food = (count: number) => locale === 'en' ? `Feeding requires ${count} food` : `喂养需要${count}食物`
      const fuel = (count: number) => locale === 'en' ? `Heating requires ${count} fuel` : `供暖需要${count}燃料`
      const heading = locale === 'en' ? 'Next harvest · Round 4' : '下次收获 · 第4回合'
      for (const page of pages) {
        await page.setViewportSize({ width: 1920, height: 1080 })
        const overview = page.locator('.desktop-player-overview__player')
        await expect(overview.nth(0).getByTestId('harvest-requirements')).toContainText(heading)
        await expect(overview.nth(0).getByLabel(food(6))).toBeVisible()
        await expect(overview.nth(0).getByLabel(fuel(2))).toBeVisible()
        await expect(overview.nth(1).getByLabel(food(4))).toBeVisible()
        await expect(overview.nth(1).getByLabel(fuel(1))).toBeVisible()
      }
      const page = pages[0]!
      const farm = page.locator('.game-layout__center .farm-header').getByTestId('harvest-requirements')
      await expect(farm.getByLabel(food(6))).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath('harvest-needs-desktop.png') })
      await page.locator('.desktop-player-overview__name').nth(1).click()
      await expect(farm.getByLabel(food(4))).toBeVisible()
      await expect(farm.getByLabel(fuel(1))).toBeVisible()
      await page.setViewportSize({ width: 390, height: 844 })
      await farm.scrollIntoViewIfNeeded()
      await expect(farm).toBeInViewport()
      await expect(farm.getByLabel(fuel(1))).toBeVisible()
      const bounds = await farm.boundingBox()
      expect(bounds).not.toBeNull()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
      await page.screenshot({ path: testInfo.outputPath('harvest-needs-mobile.png') })
      await driver.reload()
      await expect(farm.getByLabel(food(6))).toBeVisible()

      const base = createWorkSession({ seed: 5422 })
      const baseState = base.withCtx(() => serializeState(base.state, {}))
      base.dispose()
      await driver.command(0, { type: 'loadGame', state: baseState })
      await expect(farm.getByLabel(food(4))).toBeVisible()
      await expect(farm.locator('.res-icon-fuel')).toHaveCount(0)
    } finally {
      await Promise.all(pages.map(page => page.close()))
    }
  })
}
