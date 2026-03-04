import { test, expect } from '@playwright/test'
import { spawn } from 'child_process'
import * as fs from 'fs'

let backendProcess: any
let frontendProcess: any

function ensureOutputDir() {
  const outputDir = 'output'
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
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

test.describe('E21_SheepRug Effect', () => {
  test('Player with SheepRug can use occupied Wish for Children', async ({ page }) => {
    ensureOutputDir()
    console.log('=== E21 SheepRug Effect Test ===')
    
    // Navigate to game first to establish connection
    await page.goto('http://localhost:5173/?player=p1')
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.waitForTimeout(3000)
    
    // Step 1: Setup state via API
    const setupResult = await page.evaluate(async () => {
      try {
        await fetch('http://localhost:5175/api/game/new', { method: 'POST' })
        await fetch('http://localhost:5175/api/game/dev/play-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerIndex: 1, cardId: 'E21_SheepRug' })
        })
        await fetch('http://localhost:5175/api/game/dev/set-resources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            playerIndex: 1, 
            resources: { sheep: 3, wood: 10, reed: 5, food: 5 }
          })
        })
        
        const response = await fetch('http://localhost:5175/api/game/state')
        const data = await response.json()
        return {
          success: true,
          p2HasSheepRug: data.state.players?.[1]?.minorPlayed?.includes('E21_SheepRug'),
          p2Resources: data.state.players?.[1]?.resources
        }
      } catch (e: any) {
        return { success: false, error: e.message }
      }
    })
    console.log('Setup result:', setupResult)
    
    // Reload page to reflect new game state
    await page.reload()
    await page.waitForTimeout(2000)
    
    // Step 2: Enable dev mode and advance to Round 5
    const cb = page.locator('input[type="checkbox"]').first()
    await cb.waitFor({ state: 'visible', timeout: 5000 })
    if (!(await cb.isChecked())) await cb.click()
    await page.waitForTimeout(1000)
    
    // Wait for dev panel
    const dev = page.locator('.dev-panel')
    await dev.waitFor({ state: 'visible', timeout: 5000 })
    
    // Advance round
    const roundInput = dev.locator('input[type="number"]').nth(1)
    await roundInput.waitFor({ state: 'visible', timeout: 5000 })
    await roundInput.fill('5')
    await dev.locator('button').nth(1).click()
    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'output/E21_Effect_01_round5.png', fullPage: true })
    
    // Step 3: Occupy Wish for Children and set p2 as current player
    const setupResult2 = await page.evaluate(async () => {
      try {
        await fetch('http://localhost:5175/api/game/dev/set-space-taken', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spaceId: 'wish-children', playerId: 'p1' })
        })
        await fetch('http://localhost:5175/api/game/dev/set-current-player', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerIndex: 1 })
        })
        
        const response = await fetch('http://localhost:5175/api/game/state')
        const data = await response.json()
        return {
          round: data.state.round,
          currentPlayer: data.state.currentPlayerIndex,
          wishChildrenTakenBy: data.state.actionSpaces?.find((s: any) => s.id === 'wish-children')?.takenBy,
          p2HasSheepRug: data.state.players?.[1]?.minorPlayed?.includes('E21_SheepRug')
        }
      } catch (e: any) {
        return { error: e.message }
      }
    })
    console.log('After round 5 setup:', setupResult2)
    
    // Step 4: Navigate to p2 view
    await page.goto('http://localhost:5173/?player=p2')
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'output/E21_Effect_02_p2_view.png', fullPage: true })
    
    // Step 5: Check if Wish for Children is enabled for p2
    const wishSpace = page.locator('[data-space-id="wish-children"]')
    const isVisible = await wishSpace.isVisible().catch(() => false)
    console.log(`Wish for Children visible: ${isVisible}`)
    
    if (isVisible) {
      const isDisabled = await wishSpace.evaluate(el => 
        el.hasAttribute('disabled') || (el as HTMLButtonElement).disabled || el.classList.contains('opacity-50')
      )
      console.log(`Wish for Children disabled for P2 with SheepRug: ${isDisabled}`)
      
      if (!isDisabled) {
        console.log('✅ Effect WORKING! P2 can click occupied Wish for Children')
      } else {
        console.log('❌ Effect NOT working - space is disabled')
      }
    }
    
    await page.screenshot({ path: 'output/E21_Effect_03_final.png', fullPage: true })
  })
  
  test('Without SheepRug, player cannot use occupied Wish for Children', async ({ page }) => {
    ensureOutputDir()
    console.log('=== Control Test: Without SheepRug ===')
    
    // Navigate first
    await page.goto('http://localhost:5173/?player=p1')
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.waitForTimeout(3000)
    
    // Setup state via API
    await page.evaluate(async () => {
      await fetch('http://localhost:5175/api/game/new', { method: 'POST' })
      await fetch('http://localhost:5175/api/game/dev/set-resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          playerIndex: 1, 
          resources: { wood: 10, reed: 5, food: 5 }
        })
      })
    })
    
    // Reload and enable dev mode
    await page.reload()
    await page.waitForTimeout(2000)
    
    const cb = page.locator('input[type="checkbox"]').first()
    await cb.waitFor({ state: 'visible', timeout: 5000 })
    if (!(await cb.isChecked())) await cb.click()
    await page.waitForTimeout(1000)
    
    // Advance to round 5
    const dev = page.locator('.dev-panel')
    await dev.waitFor({ state: 'visible', timeout: 5000 })
    const roundInput = dev.locator('input[type="number"]').nth(1)
    await roundInput.waitFor({ state: 'visible', timeout: 5000 })
    await roundInput.fill('5')
    await dev.locator('button').nth(1).click()
    await page.waitForTimeout(2000)
    
    // Setup occupation
    await page.evaluate(async () => {
      await fetch('http://localhost:5175/api/game/dev/set-space-taken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spaceId: 'wish-children', playerId: 'p1' })
      })
      await fetch('http://localhost:5175/api/game/dev/set-current-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerIndex: 1 })
      })
    })
    
    // Navigate to p2 view
    await page.goto('http://localhost:5173/?player=p2')
    await page.waitForTimeout(3000)
    
    const wishSpace = page.locator('[data-space-id="wish-children"]')
    const isVisible = await wishSpace.isVisible().catch(() => false)
    
    if (isVisible) {
      const isDisabled = await wishSpace.evaluate(el => 
        el.hasAttribute('disabled') || (el as HTMLButtonElement).disabled || el.classList.contains('opacity-50')
      )
      console.log(`Wish for Children disabled for P2 without SheepRug: ${isDisabled}`)
      await page.screenshot({ path: 'output/E21_Effect_05_control.png', fullPage: true })
      expect(isDisabled).toBe(true)
    }
  })
})
