import { expect, test, type BrowserContext } from '@playwright/test'
import { authenticateSolo, SoloBrowserDriver } from './helpers/standard-solo-acceptance'
import { FRONTEND_URL } from './fixtures'

test('four-player draft shows opening ranks and who is still choosing through reload and round advance', async ({ browser, request }, testInfo) => {
  const contexts: BrowserContext[] = []
  const drivers: SoloBrowserDriver[] = []
  const suffix = Date.now().toString(36)
  try {
    for (let index = 0; index < 4; index++) {
      const context = await browser.newContext()
      contexts.push(context)
      await authenticateSolo(context, request, `draft_${suffix}_${index}`)
      drivers.push(new SoloBrowserDriver(await context.newPage()))
    }
    const host = drivers[0]!
    await host.page.goto(`${FRONTEND_URL}/?transport=ws&maxPlayers=4&draftMode=simultaneous&draftPoolSize=7&enableSnakeOpening=true`)
    const id = host.page.locator('.ws-invite-roomid strong')
    await expect(id).toBeVisible()
    const roomId = await id.innerText()
    for (const driver of drivers.slice(1)) {
      await driver.page.goto(`${FRONTEND_URL}/?room=${roomId}`)
      await expect(driver.page.locator('.ws-waiting-seats')).toBeVisible()
    }
    await drivers[3]!.page.getByRole('button', { name: 'Confirm color and start', exact: true }).click()
    for (const [index, driver] of drivers.entries()) {
      const order = driver.page.getByRole('region', { name: 'Opening turn order' })
      await expect(order).toBeVisible()
      await expect(order.locator('li')).toHaveCount(4)
      await expect(order.locator('[data-is-you="true"]')).toContainText(`draft_${suffix}_${index}`)
      await expect(order.getByText('Start Player', { exact: true })).toHaveCount(1)
      await expect(order.locator('[data-submitted="false"]')).toHaveCount(4)
      await expect(order).toContainText('Snake opening')
      expect(driver.state.players.map(player => player.name)).toEqual(host.state.players.map(player => player.name))
      const me = driver.state.players.find(player => player.name === `draft_${suffix}_${index}`)!
      expect(driver.state.draft!.pools[me.id]!.occ.every(card => card !== '?')).toBe(true)
      for (const player of driver.state.players.filter(player => player.id !== me.id)) {
        expect(driver.state.draft!.pools[player.id]!.occ.every(card => card === '?')).toBe(true)
      }
    }
    const opening = host.state.players.map(player => [player.id, player.name, player.color])
    const pick = async (driver: SoloBrowserDriver) => {
      await driver.page.locator('.draft-pool-row-occ .draft-card').first().click()
      await driver.page.locator('.draft-pool-row-minor .draft-card').first().click()
      await driver.ui('confirm-draft', () => driver.page.getByRole('button', { name: 'Confirm picks', exact: true }).click())
    }
    await pick(host)
    const waiting = host.page.getByRole('region', { name: 'Opening turn order' }).getByRole('status')
    await expect(waiting).toContainText(`draft_${suffix}_1`)
    await pick(drivers[1]!)
    for (const driver of drivers) await expect(driver.page.locator('.draft-opening-selection[data-submitted="true"]')).toHaveCount(2)
    await expect(waiting).not.toContainText(`draft_${suffix}_1`)
    await expect(waiting).toContainText(`draft_${suffix}_2`)
    await expect(waiting).toContainText(`draft_${suffix}_3`)
    await host.page.reload()
    await expect(host.page.locator('.draft-overlay-status')).toHaveAttribute('data-already-submitted', '1')
    expect(host.state.players.map(player => [player.id, player.name, player.color])).toEqual(opening)
    for (const width of [1280, 320]) {
      await host.page.setViewportSize({ width, height: 900 })
      await expect(host.page.getByRole('region', { name: 'Opening turn order' })).toBeVisible()
      expect(await host.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await host.page.screenshot({ path: testInfo.outputPath(`draft-waiting-${width}.png`), fullPage: true })
    }
    await pick(drivers[2]!)
    await pick(drivers[3]!)
    for (const driver of drivers) {
      await expect(driver.page.locator('.draft-overlay-title')).toHaveText('Draft — Round 2 / 7')
      await expect(driver.page.locator('.draft-opening-selection[data-submitted="false"]')).toHaveCount(4)
      expect(driver.state.players.map(player => [player.id, player.name, player.color])).toEqual(opening)
    }
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})
