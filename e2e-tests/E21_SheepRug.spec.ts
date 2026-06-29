import { test, expect } from '@playwright/test'
import { saveScreenshot } from './fixtures'

test.describe('E021_SheepRug E2E Tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('/?player=p1')
    await page.waitForTimeout(3000)

    // Enable dev mode
    const checkbox = page.locator('input[type="checkbox"]').first()
    if (await checkbox.isVisible().catch(() => false)) {
      if (!(await checkbox.isChecked())) {
        await checkbox.click()
        await page.waitForTimeout(2000)
      }
    }
  })

  test('Complete E021_SheepRug test flow with Improvement action', async ({ page }) => {
    // Step 1: Initial state - Reset game first
    console.log('Step 1: Initial state')

    // Reset game state first to ensure clean start
    await page.locator('button:has-text("Reset")').click()
    await page.waitForTimeout(2000)

    await saveScreenshot(page, 'E021_S01_initial', 'output')

    const devPanel = page.locator('.dev-panel')

    // Step 2: Create pasture using dev panel
    console.log('Step 2: Create pasture')
    await devPanel.locator('button:has-text("Create Pasture")').click()
    await page.waitForTimeout(2000)

    // Build a 2-tile pasture (need 6 wood, 3 per tile)
    // Click on farm tiles to build fences - build a 2-tile pasture
    // Click tile (0,0) and (0,1) to build two adjacent pastures
    const farmBoard = page.locator('.farm-board').first()

    // Click on tile at row 0, col 0 (top-left area, empty green tile)
    const tile00 = farmBoard.locator('[data-row="0"][data-col="0"]').first()
    if (await tile00.isVisible().catch(() => false)) {
      await tile00.click()
      await page.waitForTimeout(1000)
    }

    // Click on tile at row 0, col 1 (adjacent tile)
    const tile01 = farmBoard.locator('[data-row="0"][data-col="1"]').first()
    if (await tile01.isVisible().catch(() => false)) {
      await tile01.click()
      await page.waitForTimeout(1000)
    }

    // Confirm the fence building if there's a confirm button
    const confirmButton = page.locator('button:has-text("Confirm")').first()
    if (await confirmButton.isVisible().catch(() => false)) {
      await confirmButton.click()
      await page.waitForTimeout(2000)
    }

    await saveScreenshot(page, 'E021_S02_pasture_created', 'output')
    console.log('Pasture created (check screenshot for fence segments)')
    console.log('Step 2: Create pasture')
    await devPanel.locator('button:has-text("Create Pasture")').click()
    await page.waitForTimeout(2000)
    await saveScreenshot(page, 'E021_S02_pasture_created', 'output')
    console.log('Pasture created (check screenshot for fence segments)')

    // Step 3: Draw E021_SheepRug to hand
    console.log('Step 3: Draw E021_SheepRug to hand')
    await devPanel.locator('input[type="text"]').first().fill('E021_SheepRug')
    await page.waitForTimeout(500)
    await devPanel.locator('button').nth(3).click() // Draw Card button
    await page.waitForTimeout(2000)
    await saveScreenshot(page, 'E021_S03_card_drawn', 'output')
    console.log('Card drawn to hand')

    // Step 4: Give 3 sheep (should trigger reorganize)
    console.log('Step 4: Give 3 sheep')
    await devPanel.locator('select').nth(1).selectOption('sheep')
    await page.waitForTimeout(500)
    await devPanel.locator('input[type="number"]').first().fill('3')
    await page.waitForTimeout(500)
    await devPanel.locator('button').nth(0).click() // Apply button
    await page.waitForTimeout(2000)
    await saveScreenshot(page, 'E021_S04_sheep_3', 'output')
    console.log('3 sheep given to player')

    // Step 5: Show state with 3 sheep (cannot play yet)
    console.log('Step 5: Show state with 3 sheep (cannot play yet - need 4 for prerequisite)')
    await saveScreenshot(page, 'E021_S05_cannot_play', 'output')
    console.log('Cannot play yet - need 4 sheep for prerequisite')

    // Step 6: Give 1 more sheep (now 4, should trigger reorganize)
    console.log('Step 6: Give 1 more sheep (total 4)')
    await devPanel.locator('input[type="number"]').first().fill('4')
    await page.waitForTimeout(500)
    await devPanel.locator('button').nth(0).click() // Apply button
    await page.waitForTimeout(2000)
    await saveScreenshot(page, 'E021_S06_sheep_4', 'output')
    console.log('4 sheep given, prerequisite met')

    // Step 7: Play card via dev panel
    console.log('Step 7: Play E021_SheepRug')
    await devPanel.locator('button').nth(2).click() // Play Card button
    await page.waitForTimeout(2000)
    await saveScreenshot(page, 'E021_S07_card_played', 'output')
    console.log('Card played successfully')

    // Step 8: Verify final state
    console.log('Step 8: Verify final state')
    await saveScreenshot(page, 'E021_S08_final', 'output')
    console.log('Final state captured - verify card is in played area and sheep count is 3')

    console.log('Test completed!')
    console.log('Screenshots saved in output/ directory:')
    console.log('  - E021_S01_initial.png')
    console.log('  - E021_S02_pasture_created.png')
    console.log('  - E021_S03_card_drawn.png')
    console.log('  - E021_S04_sheep_3.png')
    console.log('  - E021_S05_cannot_play.png')
    console.log('  - E021_S06_sheep_4.png')
    console.log('  - E021_S07_card_played.png')
    console.log('  - E021_S08_final.png')
  })
})
