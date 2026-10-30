import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { FRONTEND_URL } from './fixtures'
import { authenticateSolo, recordSoloEvidence, SoloBrowserDriver } from './helpers/standard-solo-acceptance'
import { checkpoint, restartIsolatedBackend } from './helpers/standard-solo-process'

const clearHotseatCover = async (page: Page) => {
  await page.locator('.game-layout, .hotseat-handoff').first().waitFor()
  const handoff = page.getByRole('dialog', { name: 'Hotseat handoff' })
  if (await handoff.isVisible()) await handoff.getByRole('button', { name: /continue$|，开始$/ }).click()
}

for (const width of [1280, 375]) for (const mode of ['multiplayer', 'hotseat', 'solo'] as const) {
  test(`Moor balance creation, synchronization and refresh: ${mode} at ${width}px`, async ({ browser, request }, testInfo) => {
    test.setTimeout(90_000)
    const contexts: BrowserContext[] = []
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width === 375 })
    contexts.push(context)
    const page = await context.newPage()
    const driver = new SoloBrowserDriver(page)
    try {
      await authenticateSolo(context, request, `mb_${mode[0]}_${width}_${Date.now().toString(36)}`)
      await page.goto(FRONTEND_URL)
      await page.getByRole('button', { name: mode === 'solo' ? 'Solo game' : mode === 'hotseat' ? 'Local Hotseat' : 'Create Multiplayer Game', exact: true }).click()
      const setup = mode === 'solo' ? page.getByRole('dialog', { name: 'Start a solo game' }) : page.locator('.player-select-panel')
      const moor = setup.getByRole('checkbox', { name: 'Enable Farmers of the Moor expansion', exact: true })
      await expect(setup.getByRole('checkbox', { name: 'Moor balance rules', exact: true })).toHaveCount(0)
      await moor.check()
      const balance = setup.getByRole('checkbox', { name: 'Moor balance rules', exact: true })
      await expect(balance).not.toBeChecked()
      await balance.check()
      await moor.uncheck()
      await expect(balance).toHaveCount(0)
      await moor.check()
      await expect(balance).not.toBeChecked()
      await balance.check()
      await setup.getByRole('button', { name: mode === 'solo' ? 'Start solo game' : mode === 'hotseat' ? 'Start Hotseat Game' : 'Create Game', exact: true }).click()
      await expect(page).toHaveURL(/\?room=[^&]+$/)
      const roomId = new URL(page.url()).searchParams.get('room')!

      if (mode === 'multiplayer') {
        const guest = await browser.newContext({ viewport: { width, height: 900 } })
        contexts.push(guest)
        await authenticateSolo(guest, request, `mb_guest_${width}_${Date.now().toString(36)}`)
        const guestPage = await guest.newPage()
        const guestDriver = new SoloBrowserDriver(guestPage)
        await guestPage.goto(`${FRONTEND_URL}/?room=${roomId}`)
        await guestPage.locator('.ws-confirm-color').click()
        await expect(guestPage.getByTestId('moor-balance-rules')).toBeVisible()
        expect(guestDriver.state.enableMoorBalanceRules).toBe(true)
        await guestPage.reload({ waitUntil: 'domcontentloaded' })
        await expect(guestPage.getByTestId('moor-balance-rules')).toBeVisible()
      } else if (mode === 'hotseat') await clearHotseatCover(page)

      await expect(page.getByTestId('moor-balance-rules')).toBeVisible()
      expect(driver.state).toMatchObject({ enableFarmersOfTheMoor: true, enableMoorBalanceRules: true })
      expect(driver.commands.find(command => command.type === 'createRoom')).toMatchObject({ enableFarmersOfTheMoor: true, enableMoorBalanceRules: true })
      const before = await checkpoint(roomId)
      expect(before.frame).toMatchObject({ enableMoorBalanceRules: true })
      const start = driver.events.length
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect.poll(() => driver.events.slice(start).some(event => event.type === 'stateUpdate')).toBe(true)
      if (mode === 'hotseat') await clearHotseatCover(page)
      await expect(page.getByTestId('moor-balance-rules')).toBeVisible()
      expect(driver.state.enableMoorBalanceRules).toBe(true)
      expect(driver.commands.filter(command => command.type === 'createRoom')).toHaveLength(1)
      const label = await page.getByTestId('moor-balance-rules').boundingBox()
      expect(label).not.toBeNull()
      expect(label!.x + label!.width).toBeLessThanOrEqual(width)
      await page.screenshot({ path: testInfo.outputPath(`moor-balance-${mode}-${width}.png`), fullPage: true })

      if (mode === 'solo' && width === 375) {
        const processes = await restartIsolatedBackend(before.viewerBuildId, before.gameBuildId)
        expect(await checkpoint(roomId)).toEqual(before)
        const count = driver.events.length
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expect.poll(() => driver.events.slice(count).some(event => event.type === 'stateUpdate')).toBe(true)
        await expect(page.getByTestId('moor-balance-rules')).toBeVisible()
        expect(driver.state.enableMoorBalanceRules).toBe(true)
        await recordSoloEvidence(testInfo, 'moor-balance-recovery', { before, processes, latest: driver.envelope })
      }
      await driver.attach(testInfo, `moor-balance-${mode}-${width}`)
    } finally { await Promise.all(contexts.map(context => context.close())) }
  })
}
