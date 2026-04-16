import { test, expect, type Page } from '@playwright/test'
import { saveScreenshot, saveState, FRONTEND_URL } from './fixtures'

test.use({ viewport: { width: 1920, height: 1080 } })

test.describe('WS dual-player sync', () => {
  const countTaken = (page: Page) =>
    page.locator('.action-card-holder.taken').count()
  const takenHolderByText = (page: Page, text: string) =>
    page.locator('.action-card-holder.taken', { hasText: text })

  test('full game flow: create room, sync actions, confirm next player, undo', async ({ browser }) => {
    test.setTimeout(120_000)

    const ctx1 = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
    let ctx2 = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
    const p1 = await ctx1.newPage()
    let p2 = await ctx2.newPage()

    // Step 1: P1 creates room
    console.log('\n=== Step 1: P1 creates room ===')
    await p1.goto(`${FRONTEND_URL}/?player=p1&transport=ws`)
    await p1.waitForSelector('text=/等待玩家加入|waiting for other player/i', { timeout: 15000 })
    await saveScreenshot(p1, '01-p1-waiting')

    const bodyText = await p1.textContent('body')
    const roomMatch = bodyText?.match(/(?:Room|房间)\s+(\w+)/)
    const roomId = roomMatch?.[1]
    console.log(`Room ID: ${roomId}`)
    expect(roomId).toBeTruthy()
    saveState('ws-room', { roomId })

    // Step 2: P2 joins room
    console.log('\n=== Step 2: P2 joins room ===')
    await p2.goto(`${FRONTEND_URL}/?player=p2&transport=ws&room=${roomId}`)

    await p1.waitForSelector('.board', { timeout: 15000 })
    await p2.waitForSelector('.board', { timeout: 15000 })
    console.log('Both boards loaded')
    await saveScreenshot(p1, '02-p1-board')
    await saveScreenshot(p2, '02-p2-board')

    // Step 3: P1 takes action (Forest) -> P2 sees taken
    console.log('\n=== Step 3: P1 action -> P2 sync ===')
    const initialTaken = await countTaken(p2)

    const forestBtn = p1.locator('main .action-card-holder button:not([disabled])').first()
    await expect(forestBtn).toBeVisible()
    const actionName = (await forestBtn.textContent())?.trim() ?? 'unknown'
    console.log(`P1 clicking: ${actionName}`)
    await forestBtn.evaluate((button: HTMLButtonElement) => button.click())
    await expect.poll(() => countTaken(p1), { timeout: 10000 }).toBeGreaterThan(initialTaken)
    await expect.poll(() => countTaken(p2), { timeout: 10000 }).toBeGreaterThan(initialTaken)
    const takenAfterAction = await countTaken(p2)
    console.log(`Taken count after action: ${initialTaken} -> ${takenAfterAction}`)
    await expect(takenHolderByText(p1, actionName)).toHaveCount(1)
    await expect(takenHolderByText(p2, actionName)).toHaveCount(1)
    await saveScreenshot(p1, '03-p1-after-action')
    await saveScreenshot(p2, '03-p2-after-action')

    // Step 4: Undo must roll both players back to the same taken count
    console.log('\n=== Step 4: Undo sync ===')
    const undoBtn = p1.getByRole('button', { name: /撤销上一步|Undo Step/ })
    await expect(undoBtn).toBeEnabled()
    await undoBtn.click()
    await expect.poll(() => countTaken(p1), { timeout: 10000 }).toBe(initialTaken)
    await expect.poll(() => countTaken(p2), { timeout: 10000 }).toBe(initialTaken)
    await expect(takenHolderByText(p1, actionName)).toHaveCount(0)
    await expect(takenHolderByText(p2, actionName)).toHaveCount(0)
    await saveScreenshot(p1, '04-p1-after-undo')
    await saveScreenshot(p2, '04-p2-after-undo')

    // Step 5: Make one new action, then reconnect P2 and assert snapshot convergence
    console.log('\n=== Step 5: Reconnect sync ===')
    const replayBtn = p1.locator('main .action-card-holder button:not([disabled])').first()
    await expect(replayBtn).toBeVisible()
    const replayActionName = (await replayBtn.textContent())?.trim() ?? 'unknown'
    await replayBtn.evaluate((button: HTMLButtonElement) => button.click())
    await expect.poll(() => countTaken(p1), { timeout: 10000 }).toBeGreaterThan(initialTaken)
    const expectedTakenAfterReconnect = await countTaken(p1)

    await ctx2.close()
    ctx2 = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
    p2 = await ctx2.newPage()
    await p2.goto(`${FRONTEND_URL}/?player=p2&transport=ws&room=${roomId}`)
    await p2.waitForSelector('.board', { timeout: 15000 })
    await expect.poll(() => countTaken(p2), { timeout: 10000 }).toBe(expectedTakenAfterReconnect)
    await expect(takenHolderByText(p2, replayActionName)).toHaveCount(1)
    await saveScreenshot(p2, '05-p2-after-reconnect')

    console.log('\n=== WS dual-player test complete ===')
    await ctx1.close()
    await ctx2.close()
  })
})
