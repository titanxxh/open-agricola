// @covers client/components/interaction/
// @covers client/app/exchange-overlay-presentation.tsx
// @covers shared/moor/
import { expect, test, type Locator, type Page } from '@playwright/test'
import { joinRoomClients, roomDriver, roomSnapshot } from './room-command-driver'
import { baseHarvestFixture, moorHarvestFixture, startHarvest } from './helpers/harvest-room'

test('wood conversion and heating share the exchange center in a synchronized room', async ({ browser, request }, testInfo) => {
  const pages: [Page, Page] = [await browser.newPage(), await browser.newPage()]
  try {
    await joinRoomClients(pages, request)
    const driver = roomDriver(pages)
    const initial = moorHarvestFixture({ wood: 1, fuel: 1 })
    await driver.command(0, { type: 'loadGame', state: initial })
    const page = pages[0]
    await expect(page.locator('[data-anytime-action-id="moor-wood-to-fuel"]')).toHaveCount(0)
    const exchangeButton = page.getByRole('button', { name: 'Exchange Center', exact: true })
    await expect(exchangeButton).toHaveAttribute('data-anytime-action-id', 'exchange')
    await expect(exchangeButton).toHaveAttribute('title', 'Exchange Center')
    await expect(exchangeButton).toHaveText('')
    await expect(exchangeButton.locator('.res-icon-cook')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('exchange-entry-desktop.png') })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(exchangeButton).toBeInViewport()
    const buttonBounds = await exchangeButton.boundingBox()
    expect(buttonBounds?.width).toBeGreaterThanOrEqual(44)
    expect(buttonBounds?.height).toBeGreaterThanOrEqual(44)
    await page.screenshot({ path: testInfo.outputPath('exchange-entry-mobile.png') })
    await driver.ui(0, () => exchangeButton.click())
    const ordinaryWood = page.locator('[data-testid^="anytime-exchange-option-__basic__-"]')
    await expect(ordinaryWood).toContainText('Basic conversion')
    await ordinaryWood.getByRole('button', { name: '+', exact: true }).click()
    await driver.ui(0, () => page.locator('.exchange-overlay .exchange-confirm').click())
    expect((await roomSnapshot(page)).state.players[0]!.resources).toMatchObject({ wood: 0, fuel: 2 })
    await page.setViewportSize({ width: 1920, height: 1080 })

    await driver.command(0, { type: 'loadGame', state: initial })
    await startHarvest(pages, driver, 'heating')
    await expect(page.locator('.exchange-overlay')).toHaveCount(1)
    await expect(page.locator('.exchange-title')).toHaveText('Exchange Center')
    await expect(page.locator('.exchange-overlay')).toContainText('1/2 fuel · Newly sick 1')
    await expect(page.locator('.interaction-bar input[type="number"]')).toHaveCount(0)
    const heatingWood = page.getByTestId('heating-option-__basic__-ex2')
    await heatingWood.getByRole('button', { name: '+', exact: true }).click()
    await expect(page.locator('.exchange-overlay')).toContainText('2/2 fuel · Newly sick 0')
    await page.screenshot({ path: testInfo.outputPath('heating-exchange-center.png') })
    await driver.ui(0, () => page.locator('.exchange-overlay .exchange-confirm').click())
    for (const currentPage of pages) {
      const current = await roomSnapshot(currentPage)
      expect(current.state.players[0]!.resources).toMatchObject({ food: 0, wood: 0, fuel: 0 })
      expect(current.state.players[0]!.sickWorkerIds).toEqual([])
    }
    await expect(page.locator('.exchange-overlay')).toHaveCount(0)
    await expect(pages[1].locator('.exchange-overlay')).toContainText('2/2 fuel · Newly sick 0')
    await driver.ui(1, () => pages[1].locator('.exchange-overlay .exchange-confirm').click())
    await expect(pages[1].locator('.exchange-overlay')).toHaveCount(0)
  } finally { await Promise.all(pages.map(page => page.close())) }
})

test('harvest shortfalls require confirmation and preserve exchange choices when going back', async ({ browser, request }) => {
  const pages: [Page, Page] = [await browser.newPage(), await browser.newPage()]
  try {
    await joinRoomClients(pages, request)
    const driver = roomDriver(pages)
    const page = pages[0]
    const exchange = page.locator('.exchange-overlay')
    const confirm = exchange.getByRole('button', { name: 'Confirm', exact: true })
    const warning = page.getByRole('alertdialog', { name: 'Resource shortage' })

    const confirmShortfall = async (trigger: Locator, progress: string, consequence: string, returnBy: 'button' | 'escape') => {
      await expect(exchange).toContainText(progress)
      const pending = await roomSnapshot(page)
      await trigger.click()
      await expect(warning).toBeVisible()
      await expect(warning).toContainText(consequence)
      expect(await roomSnapshot(page)).toEqual(pending)

      const back = warning.getByRole('button', { name: 'Back to exchange', exact: true })
      await expect(back).toBeFocused()
      if (returnBy === 'button') await back.click()
      else await page.keyboard.press('Escape')
      await expect(warning).toHaveCount(0)
      await expect(exchange).toContainText(progress)
      expect(await roomSnapshot(page)).toEqual(pending)

      await confirm.click()
      await driver.ui(0, () => warning.getByRole('button', { name: 'Continue', exact: true }).click())
      await expect(warning).toHaveCount(0)
    }

    await driver.command(0, { type: 'loadGame', state: moorHarvestFixture({ food: 2, grain: 1, fuel: 1 }) })
    await page.setViewportSize({ width: 390, height: 844 })
    await startHarvest(pages, driver, 'feed')
    await expect(exchange).toContainText('2/4 · Begging 2')
    await page.getByTestId('harvest-feed-option-__basic__-ex0').getByRole('button', { name: '+', exact: true }).click()
    await confirmShortfall(confirm, '3/4 · Begging 1', 'You are still short 1 food. Expected begging cards: 1.', 'button')

    const fed = await roomSnapshot(page)
    expect(fed.state.players[0]!.resources).toMatchObject({ food: 0, grain: 0, begging: 1, fuel: 1, wood: 0 })
    expect(fed.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'heating' } })

    await page.setViewportSize({ width: 1920, height: 1080 })
    await expect(exchange).toContainText('1/2 fuel · Newly sick 1')
    await page.getByTestId('heating-fuel-payment').getByRole('button', { name: '-', exact: true }).click()
    const barConfirm = page.locator('.interaction-bar').getByRole('button', { name: 'Confirm', exact: true })
    await confirmShortfall(barConfirm, '0/2 fuel · Newly sick 2', 'You are still short 2 fuel. Expected newly sick family members: 2.', 'escape')

    for (const roomPage of pages) {
      const heated = await roomSnapshot(roomPage)
      expect(heated.state.players[0]!.resources).toMatchObject({ food: 0, grain: 0, begging: 1, wood: 0, fuel: 1 })
      expect(heated.state.players[0]!.sickWorkerIds).toHaveLength(2)
      expect(heated.state.events.filter(event => event.type === 'harvest.heated')).toEqual([
        expect.objectContaining({ required: 2, fuelUsed: 0, woodToFuel: 0 }),
      ])
    }
    expect((await roomSnapshot(pages[1])).interaction).toMatchObject({ stateId: 'wait', playerIndex: 1, request: { kind: 'heating' } })
  } finally { await Promise.all(pages.map(page => page.close())) }
})

test('a feeding exchange that covers the shortfall settles with one confirmation', async ({ browser, request }) => {
  const pages: [Page, Page] = [await browser.newPage(), await browser.newPage()]
  try {
    await joinRoomClients(pages, request)
    const driver = roomDriver(pages)
    const page = pages[0]
    const exchange = page.locator('.exchange-overlay')
    await driver.command(0, { type: 'loadGame', state: baseHarvestFixture((player, state) => {
      player.improvements = ['Major_Fireplace1']
      state.availableMajorImprovements = state.availableMajorImprovements.filter(card => card !== 'Major_Fireplace1')
      Object.assign(player.resources, { food: 3, grain: 1, sheep: 1 })
      const room = player.roomTiles[0]!
      player.houseAnimals = { [`${room.row}-${room.col}`]: 'sheep' }
    }) })
    await startHarvest(pages, driver, 'feed')
    await expect(exchange).toContainText('3/4 · Begging 1')
    // Cooking the house sheep stays on offer after the exchange; that alone no longer reopens feeding.
    await expect(exchange.getByTestId(/^harvest-feed-option-Major_Fireplace1-/).first()).toBeVisible()
    await page.getByTestId('harvest-feed-option-__basic__-ex0').getByRole('button', { name: '+', exact: true }).click()
    await expect(exchange).toContainText('4/4 · Begging 0')
    await driver.ui(0, () => exchange.getByRole('button', { name: 'Confirm', exact: true }).click())
    await expect(page.getByRole('alertdialog', { name: 'Resource shortage' })).toHaveCount(0)
    for (const roomPage of pages) {
      await expect(roomPage.locator('.exchange-overlay')).toHaveCount(0)
      const settled = await roomSnapshot(roomPage)
      expect(settled.state.round).toBe(5)
      expect(settled.interaction.stateId).toBe('idle')
      expect(settled.state.players[0]!.resources).toMatchObject({ food: 0, grain: 0, sheep: 1, begging: 0 })
      expect(settled.state.log.filter(entry => entry.key === 'log.harvestFeedDetail' &&
        entry.playerId === settled.state.players[0]!.id)).toEqual([expect.objectContaining({
        params: expect.objectContaining({ resources: { grain: 1, food: 4 } }),
      })])
    }
  } finally { await Promise.all(pages.map(page => page.close())) }
})
