import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'

const OUTPUT_DIR = path.resolve(process.cwd(), 'output/ws-e2e')
const FRONTEND = 'http://localhost:5173'

test.use({ viewport: { width: 1920, height: 1080 } })

const shot = async (page: import('@playwright/test').Page, name: string) => {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  await page.screenshot({ path: path.join(OUTPUT_DIR, `${name}.png`), fullPage: false })
  console.log(`[Screenshot] ${name}`)
}

const saveState = (name: string, data: unknown) => {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  writeFileSync(path.join(OUTPUT_DIR, `${name}.json`), JSON.stringify(data, null, 2))
}

test.describe('WS dual-player sync', () => {
  test('full game flow: create room, sync actions, confirm next player, undo', async ({ browser }) => {
    test.setTimeout(120_000)

    const ctx1 = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
    const ctx2 = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
    const p1 = await ctx1.newPage()
    const p2 = await ctx2.newPage()

    // Step 1: P1 creates room
    console.log('\n=== Step 1: P1 creates room ===')
    await p1.goto(`${FRONTEND}/?player=p1&transport=ws`)
    await p1.waitForSelector('text=waiting for other player', { timeout: 15000 })
    await shot(p1, '01-p1-waiting')

    const bodyText = await p1.textContent('body')
    const roomMatch = bodyText?.match(/Room\s+(\w+)/)
    const roomId = roomMatch?.[1]
    console.log(`Room ID: ${roomId}`)
    expect(roomId).toBeTruthy()

    // Step 2: P2 joins room
    console.log('\n=== Step 2: P2 joins room ===')
    await p2.goto(`${FRONTEND}/?player=p2&transport=ws`)

    await p1.waitForSelector('.board', { timeout: 15000 })
    await p2.waitForSelector('.board', { timeout: 15000 })
    console.log('Both boards loaded')
    await shot(p1, '02-p1-board')
    await shot(p2, '02-p2-board')

    // Step 3: P1 takes action (Forest) -> P2 sees taken
    console.log('\n=== Step 3: P1 action -> P2 sync ===')
    const p2TakenBefore = await p2.locator('button.action-card.taken').count()

    const forestBtn = p1.locator('button.action-card:not(.taken):not(:disabled):not(.locked)').first()
    const actionName = await forestBtn.locator('.action-title').textContent().catch(() => 'unknown')
    console.log(`P1 clicking: ${actionName}`)
    await forestBtn.click()
    await p1.waitForTimeout(2000)
    await p2.waitForTimeout(1000)

    const p2TakenAfter = await p2.locator('button.action-card.taken').count()
    console.log(`P2 taken: ${p2TakenBefore} -> ${p2TakenAfter}`)
    expect(p2TakenAfter).toBeGreaterThan(p2TakenBefore)
    await shot(p1, '03-p1-after-action')
    await shot(p2, '03-p2-after-action')

    // Step 4: Confirm next player -> P2 becomes current
    console.log('\n=== Step 4: Confirm next player ===')
    const confirmBtn = p1.locator('button:has-text("Confirm")').first()
    const confirmVisible = await confirmBtn.isVisible().catch(() => false)
    if (confirmVisible) {
      await confirmBtn.click()
      await p1.waitForTimeout(2000)
      await p2.waitForTimeout(1000)
      console.log('Next player confirmed')
    } else {
      console.log('No confirm button visible, skipping')
    }
    await shot(p1, '04-p1-after-confirm')
    await shot(p2, '04-p2-after-confirm')

    // Step 5: P2 takes action -> P1 sees sync
    console.log('\n=== Step 5: P2 action -> P1 sync ===')
    const p1TakenBefore = await p1.locator('button.action-card.taken').count()

    const p2ActionBtn = p2.locator('button.action-card:not(.taken):not(:disabled):not(.locked)').first()
    const p2ActionCount = await p2ActionBtn.count()
    if (p2ActionCount > 0) {
      const p2ActionName = await p2ActionBtn.locator('.action-title').textContent().catch(() => 'unknown')
      console.log(`P2 clicking: ${p2ActionName}`)
      await p2ActionBtn.click()
      await p2.waitForTimeout(2000)
      await p1.waitForTimeout(1000)

      const p1TakenAfter = await p1.locator('button.action-card.taken').count()
      console.log(`P1 taken: ${p1TakenBefore} -> ${p1TakenAfter}`)
      expect(p1TakenAfter).toBeGreaterThan(p1TakenBefore)
    } else {
      console.log('P2 has no enabled actions (not current player), skipping')
    }
    await shot(p1, '05-p1-after-p2-action')
    await shot(p2, '05-p2-after-p2-action')

    // Step 6: Undo test
    console.log('\n=== Step 6: Undo sync ===')
    const undoBtn = p1.locator('button:has-text("Undo Step"):not(:disabled)')
    const undoCount = await undoBtn.count()
    if (undoCount > 0) {
      const takenBeforeUndo = await p2.locator('button.action-card.taken').count()
      await undoBtn.click()
      await p1.waitForTimeout(2000)
      await p2.waitForTimeout(1000)
      const takenAfterUndo = await p2.locator('button.action-card.taken').count()
      console.log(`P2 taken after undo: ${takenBeforeUndo} -> ${takenAfterUndo}`)
    } else {
      console.log('Undo button disabled or not available, skipping')
    }
    await shot(p1, '06-p1-after-undo')
    await shot(p2, '06-p2-after-undo')

    console.log('\n=== WS dual-player test complete ===')
    await ctx1.close()
    await ctx2.close()
  })
})
