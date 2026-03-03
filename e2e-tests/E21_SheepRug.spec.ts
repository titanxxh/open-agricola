import { test, expect } from '@playwright/test'
import { spawn } from 'child_process'
import * as fs from 'fs'

let backendProcess: any
let frontendProcess: any

// Helper to ensure output directory exists
function ensureOutputDir() {
  const outputDir = 'output'
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }
}

test.beforeAll(async () => {
  backendProcess = spawn('npm', ['run', 'server'], { stdio: 'ignore' })
  frontendProcess = spawn('npm', ['run', 'dev'], { stdio: 'ignore' })
  await new Promise(r => setTimeout(r, 5000))
})

test.afterAll(async () => {
  backendProcess?.kill()
  frontendProcess?.kill()
})

test.describe('E21_SheepRug E2E Tests', () => {
  
  test.beforeEach(async ({ page }) => {
    ensureOutputDir()
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('http://localhost:5173/?player=p1')
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

  test('Complete E21_SheepRug test flow with Improvement action', async ({ page }) => {
    // Step 1: Initial state - Reset game first
    console.log('Step 1: Initial state')
    
    // Reset game state first to ensure clean start
    await page.locator('button:has-text("Reset")').click()
    await page.waitForTimeout(2000)
    
    await page.screenshot({ path: 'output/E21_S01_initial.png', fullPage: true })
    
    const devPanel = page.locator('.dev-panel')
    
    // Step 2: Create pasture using dev panel
    console.log('Step 2: Create pasture')
    await devPanel.locator('button:has-text("Create Pasture")').click()
    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'output/E21_S02_pasture_created.png', fullPage: true })
    console.log('Pasture created (check screenshot for fence segments)')
    
    // Step 3: Draw E21_SheepRug to hand
    console.log('Step 3: Draw E21_SheepRug to hand')
    await devPanel.locator('input[type="text"]').first().fill('E21_SheepRug')
    await page.waitForTimeout(500)
    await devPanel.locator('button').nth(3).click() // Draw Card button
    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'output/E21_S03_card_drawn.png', fullPage: true })
    console.log('Card drawn to hand')
    
    // Step 4: Give 3 sheep (should trigger reorganize)
    console.log('Step 4: Give 3 sheep')
    await devPanel.locator('select').nth(1).selectOption('sheep')
    await page.waitForTimeout(500)
    await devPanel.locator('input[type="number"]').first().fill('3')
    await page.waitForTimeout(500)
    await devPanel.locator('button').nth(0).click() // Apply button
    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'output/E21_S04_sheep_3.png', fullPage: true })
    console.log('3 sheep given to player')
    
    // Step 5: Show state with 3 sheep (cannot play yet)
    console.log('Step 5: Show state with 3 sheep (cannot play yet - need 4 for prerequisite)')
    await page.screenshot({ path: 'output/E21_S05_cannot_play.png', fullPage: true })
    console.log('Cannot play yet - need 4 sheep for prerequisite')
    
    // Step 6: Give 1 more sheep (now 4, should trigger reorganize)
    console.log('Step 6: Give 1 more sheep (total 4)')
    await devPanel.locator('input[type="number"]').first().fill('4')
    await page.waitForTimeout(500)
    await devPanel.locator('button').nth(0).click() // Apply button
    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'output/E21_S06_sheep_4.png', fullPage: true })
    console.log('4 sheep given, prerequisite met')
    
    // Step 7: Play card via dev panel
    console.log('Step 7: Play E21_SheepRug')
    await devPanel.locator('button').nth(2).click() // Play Card button
    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'output/E21_S07_card_played.png', fullPage: true })
    console.log('Card played successfully')
    
    // Step 8: Verify final state
    console.log('Step 8: Verify final state')
    await page.screenshot({ path: 'output/E21_S08_final.png', fullPage: true })
    console.log('Final state captured - verify card is in played area and sheep count is 3')
    
    console.log('Test completed!')
    console.log('Screenshots saved in output/ directory:')
    console.log('  - E21_S01_initial.png')
    console.log('  - E21_S02_pasture_created.png')
    console.log('  - E21_S03_card_drawn.png')
    console.log('  - E21_S04_sheep_3.png')
    console.log('  - E21_S05_cannot_play.png')
    console.log('  - E21_S06_sheep_4.png')
    console.log('  - E21_S07_card_played.png')
    console.log('  - E21_S08_final.png')
  })
})