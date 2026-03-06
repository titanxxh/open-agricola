import { test, expect } from '@playwright/test'
import { spawn } from 'child_process'
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'

const OUTPUT_DIR = path.resolve(process.cwd(), 'output')
const API_BASE = process.env.BACKEND_URL ?? 'http://localhost:5175'
const FRONTEND_BASE = process.env.FRONTEND_URL ?? 'http://localhost:5173'
const CARD_ID = 'E21_SheepRug'

let backendProcess: any
let frontendProcess: any

function ensureOutputDir() {
  mkdirSync(OUTPUT_DIR, { recursive: true })
}

const saveState = (name: string, state: unknown) => {
  ensureOutputDir()
  const filePath = path.join(OUTPUT_DIR, name)
  writeFileSync(filePath, JSON.stringify(state, null, 2))
  return filePath
}

const postJson = async (request: any, url: string, body?: unknown) => {
  const resp = await request.post(url, body ? { data: body } : undefined)
  const json = await resp.json()
  return json
}

const getJson = async (request: any, url: string) => {
  const resp = await request.get(url)
  const json = await resp.json()
  return json
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

test.use({ viewport: { width: 1920, height: 1080 } })

test.describe('E21_SheepRug Effect', () => {
  test('Player with SheepRug can use occupied Wish for Children', async ({ page, request }) => {
    console.log('=== E21 SheepRug Effect Test ===')
    ensureOutputDir()

    // Step 1: Reset game
    console.log('Step 1: Reset game')
    const newResp = await postJson(request, `${API_BASE}/api/game/new`)
    saveState('E21_SheepRug_01_new.json', newResp.state)
    await page.goto(`${FRONTEND_BASE}/?player=p1`)
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'E21_SheepRug_01_new.png'), fullPage: true })

    // Enable dev mode
    const devToggle = page.locator('header .dev-toggle input[type="checkbox"]')
    if (await devToggle.isVisible() && !(await devToggle.isChecked())) {
      await devToggle.check()
    }
    await page.waitForTimeout(500)

    // Step 2: P1 uses Farm Expansion to build 2 rooms
    console.log('Step 2: P1 uses Farm Expansion in Round 1')
    await postJson(request, `${API_BASE}/api/game/dev/set-resources`, {
      playerIndex: 0,
      resources: { wood: 15, reed: 6, food: 5 }
    })

    // P1 takes Farm Expansion action
    const actionResp1 = await postJson(request, `${API_BASE}/api/game/action`, {
      playerIndex: 0,
      spaceId: 'farm-expansion'
    })
    saveState('E21_SheepRug_02_p1_farm_expansion.json', actionResp1.state)

    // Select Construct option
    if (actionResp1.pending?.type === 'choice') {
      const choiceResp = await postJson(request, `${API_BASE}/api/game/choice`, {
        playerIndex: 0,
        value: 'construct'
      })
      saveState('E21_SheepRug_03_p1_construct.json', choiceResp.state)
    }

    await page.reload()
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'E21_SheepRug_02_p1_action.png'), fullPage: true })

    // Build 2 rooms (via validate API)
    const validateResp1 = await postJson(request, `${API_BASE}/api/game/validate`, {
      type: 'room',
      playerId: 'p1',
      payload: {
        rooms: [{ row: 0, col: 2 }, { row: 0, col: 3 }],
        costPerRoom: { wood: 5, reed: 2 }
      }
    })
    saveState('E21_SheepRug_04_p1_rooms.json', validateResp1)
    console.log('P1 built 2 rooms')

    // Confirm action
    const stateAfterP1 = await getJson(request, `${API_BASE}/api/game/state`)
    if (stateAfterP1.pending?.type === 'confirmNextPlayer') {
      await postJson(request, `${API_BASE}/api/game/next-player`)
    }

    // Step 3: End Round 1
    console.log('Step 3: End Round 1')
    await postJson(request, `${API_BASE}/api/game/round-end`)
    const afterRound1 = await getJson(request, `${API_BASE}/api/game/state`)
    saveState('E21_SheepRug_05_round1_end.json', afterRound1.state)
    await page.reload()
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'E21_SheepRug_03_round1_end.png'), fullPage: true })

    // Step 4: P2 uses Farm Expansion in Round 2
    console.log('Step 4: P2 uses Farm Expansion in Round 2')
    await postJson(request, `${API_BASE}/api/game/dev/set-resources`, {
      playerIndex: 1,
      resources: { wood: 15, reed: 6, food: 5 }
    })

    const actionResp2 = await postJson(request, `${API_BASE}/api/game/action`, {
      playerIndex: 1,
      spaceId: 'farm-expansion'
    })
    saveState('E21_SheepRug_06_p2_farm_expansion.json', actionResp2.state)

    if (actionResp2.pending?.type === 'choice') {
      await postJson(request, `${API_BASE}/api/game/choice`, {
        playerIndex: 1,
        value: 'construct'
      })
    }

    // Build 2 rooms for P2
    await postJson(request, `${API_BASE}/api/game/validate`, {
      type: 'room',
      playerId: 'p2',
      payload: {
        rooms: [{ row: 0, col: 2 }, { row: 0, col: 3 }],
        costPerRoom: { wood: 5, reed: 2 }
      }
    })
    console.log('P2 built 2 rooms')

    const stateAfterP2 = await getJson(request, `${API_BASE}/api/game/state`)
    if (stateAfterP2.pending?.type === 'confirmNextPlayer') {
      await postJson(request, `${API_BASE}/api/game/next-player`)
    }

    // End Round 2
    await postJson(request, `${API_BASE}/api/game/round-end`)
    const afterRound2 = await getJson(request, `${API_BASE}/api/game/state`)
    saveState('E21_SheepRug_07_round2_end.json', afterRound2.state)

    // Step 5: Give P2 SheepRug card
    console.log('Step 5: Give P2 SheepRug card')
    await postJson(request, `${API_BASE}/api/game/dev/play-card`, {
      playerIndex: 1,
      cardId: CARD_ID
    })
    await postJson(request, `${API_BASE}/api/game/dev/set-resources`, {
      playerIndex: 1,
      resources: { sheep: 4, wood: 10, reed: 5, food: 5 }
    })
    const afterCard = await getJson(request, `${API_BASE}/api/game/state`)
    saveState('E21_SheepRug_08_card_given.json', afterCard.state)

    // Step 6: Advance to Round 7
    console.log('Step 6: Advance to Round 7')
    await page.goto(`${FRONTEND_BASE}/?player=p1`)
    const devPanel = page.locator('.dev-panel')
    const roundRow = devPanel.locator('.dev-row').filter({
      has: page.locator('input[type="number"][min="1"][max="14"]')
    })
    const roundInput = roundRow.locator('input[type="number"]').first()
    const roundButton = roundRow.locator('button.dev-apply').first()
    await roundInput.fill('7')
    await roundButton.click()
    await page.waitForTimeout(500)

    const afterRound7 = await getJson(request, `${API_BASE}/api/game/state`)
    saveState('E21_SheepRug_09_round7.json', afterRound7.state)
    await page.reload()
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'E21_SheepRug_04_round7.png'), fullPage: true })

    // Step 7: P1 occupies Wish for Children
    console.log('Step 7: P1 occupies Wish for Children')
    await postJson(request, `${API_BASE}/api/game/dev/set-space-taken`, {
      spaceId: 'wish-children',
      playerId: 'p1'
    })
    await postJson(request, `${API_BASE}/api/game/dev/set-current-player`, {
      playerIndex: 1
    })

    const afterOccupied = await getJson(request, `${API_BASE}/api/game/state`)
    saveState('E21_SheepRug_10_occupied.json', afterOccupied.state)

    // Step 8: Check P2 view - P2 WITH SheepRug should be able to click
    console.log('Step 8: Verify P2 with SheepRug can click occupied space')
    await page.goto(`${FRONTEND_BASE}/?player=p2`)
    await page.waitForTimeout(1000)
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'E21_SheepRug_05_p2_view.png'), fullPage: true })

    const wishChildren = page.locator('.action-card').filter({ hasText: /Wish for Children/i })
    const isVisible = await wishChildren.isVisible().catch(() => false)
    console.log(`Wish for Children visible: ${isVisible}`)

    if (isVisible) {
      const isDisabled = await wishChildren.evaluate(el =>
        (el as HTMLButtonElement).disabled || el.classList.contains('taken')
      )
      console.log(`Wish for Children disabled: ${isDisabled}`)

      if (!isDisabled) {
        console.log('✅ Effect WORKING! P2 with SheepRug can use occupied Wish for Children')
      } else {
        console.log('❌ Effect NOT working - P2 with SheepRug should be able to use occupied space')
      }

      expect(isDisabled).toBe(false)
    }

    saveState('E21_SheepRug_11_final.json', afterOccupied.state)
    console.log('Test completed successfully!')
  })

  test('Control: Player without SheepRug cannot use occupied Wish for Children', async ({ page, request }) => {
    console.log('=== Control Test: Without SheepRug ===')
    ensureOutputDir()

    // Reset game
    const newResp = await postJson(request, `${API_BASE}/api/game/new`)
    saveState('E21_SheepRug_control_01_new.json', newResp.state)

    await page.goto(`${FRONTEND_BASE}/?player=p1`)
    const devToggle = page.locator('header .dev-toggle input[type="checkbox"]')
    if (await devToggle.isVisible() && !(await devToggle.isChecked())) {
      await devToggle.check()
    }
    await page.waitForTimeout(500)

    // Setup: Add rooms for both players
    await postJson(request, `${API_BASE}/api/game/dev/add-rooms`, {
      playerIndex: 0,
      rooms: [{ row: 0, col: 2 }, { row: 0, col: 3 }]
    })
    await postJson(request, `${API_BASE}/api/game/dev/add-rooms`, {
      playerIndex: 1,
      rooms: [{ row: 0, col: 2 }, { row: 0, col: 3 }]
    })
    await postJson(request, `${API_BASE}/api/game/dev/set-resources`, {
      playerIndex: 1,
      resources: { wood: 10, reed: 5, food: 5 }
    })

    // Advance to Round 7
    const roundRow = page.locator('.dev-panel .dev-row').filter({
      has: page.locator('input[type="number"][min="1"][max="14"]')
    })
    const roundInput = roundRow.locator('input[type="number"]').first()
    const roundButton = roundRow.locator('button.dev-apply').first()
    await roundInput.fill('7')
    await roundButton.click()
    await page.waitForTimeout(500)

    const afterRound7 = await getJson(request, `${API_BASE}/api/game/state`)
    saveState('E21_SheepRug_control_02_round7.json', afterRound7.state)

    // P1 occupies Wish for Children
    await postJson(request, `${API_BASE}/api/game/dev/set-space-taken`, {
      spaceId: 'wish-children',
      playerId: 'p1'
    })
    await postJson(request, `${API_BASE}/api/game/dev/set-current-player`, {
      playerIndex: 1
    })

    const afterOccupied = await getJson(request, `${API_BASE}/api/game/state`)
    saveState('E21_SheepRug_control_03_occupied.json', afterOccupied.state)

    // Check P2 view - WITHOUT SheepRug should NOT be able to click
    await page.goto(`${FRONTEND_BASE}/?player=p2`)
    await page.waitForTimeout(1000)
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'E21_SheepRug_control_04_p2_view.png'), fullPage: true })

    const wishChildren = page.locator('.action-card').filter({ hasText: /Wish for Children/i })
    const isVisible = await wishChildren.isVisible().catch(() => false)

    if (isVisible) {
      const isDisabled = await wishChildren.evaluate(el =>
        (el as HTMLButtonElement).disabled || el.classList.contains('taken')
      )
      console.log(`Without SheepRug - Wish for Children disabled: ${isDisabled}`)

      if (isDisabled) {
        console.log('✅ Control test passed: Player without SheepRug cannot use occupied space')
      } else {
        console.log('❌ Control test failed: Player without SheepRug should NOT be able to use occupied space')
      }

      expect(isDisabled).toBe(true)
    }

    saveState('E21_SheepRug_control_05_final.json', afterOccupied.state)
    console.log('Control test completed!')
  })
})
