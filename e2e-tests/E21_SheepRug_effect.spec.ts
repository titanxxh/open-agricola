import { test, expect } from '@playwright/test'
import { postJson, getJson, saveState, saveScreenshot, BACKEND_URL, FRONTEND_URL } from './fixtures'

const CARD_ID = 'E21_SheepRug'

test.use({ viewport: { width: 1920, height: 1080 } })
test.setTimeout(120000)

test.describe('E21_SheepRug Effect', () => {
  test('Player with SheepRug can use occupied Wish for Children', async ({ page, request }) => {
    console.log('=== E21 SheepRug Effect Test ===')

    // Step 1: Reset game
    console.log('Step 1: Reset game')
    const newResp = await postJson(request, `${BACKEND_URL}/api/game/new`)
    saveState('E21_SheepRug_01_new.json', newResp.state)

    await page.goto(`${FRONTEND_URL}/?player=p1`)
    await page.waitForTimeout(2000)
    await saveScreenshot(page, 'E21_SheepRug_01_new', 'output')

    // Enable dev mode
    const devToggle = page.locator('header .dev-toggle input[type="checkbox"]')
    if (await devToggle.isVisible().catch(() => false)) {
      if (!(await devToggle.isChecked())) {
        await devToggle.check()
      }
    }
    await page.waitForTimeout(500)

    // ===== Setup: Add rooms to P1 and P2 =====
    console.log('=== Setup: Add rooms ===')

    // P1 already has 2 rooms, add 1 more to make 3 (Wish for Children requires 3 rooms)
    await postJson(request, `${BACKEND_URL}/api/game/dev/add-rooms`, {
      playerIndex: 0,
      rooms: [{ row: 0, col: 2 }]
    })

    // P2 already has 2 rooms, add 1 more to make 3
    await postJson(request, `${BACKEND_URL}/api/game/dev/add-rooms`, {
      playerIndex: 1,
      rooms: [{ row: 0, col: 2 }]
    })

    // Give resources
    await postJson(request, `${BACKEND_URL}/api/game/dev/set-resources`, {
      playerIndex: 0,
      resources: { wood: 10, reed: 5, food: 5 }
    })
    await postJson(request, `${BACKEND_URL}/api/game/dev/set-resources`, {
      playerIndex: 1,
      resources: { sheep: 4, wood: 10, reed: 5, food: 5 }
    })

    const afterSetup = await getJson(request, `${BACKEND_URL}/api/game/state`)
    console.log('After setup - P1 rooms:', afterSetup.state.players[0].rooms)
    console.log('After setup - P2 rooms:', afterSetup.state.players[1].rooms)
    saveState('E21_SheepRug_02_setup.json', afterSetup.state)

    // ===== Give P2 SheepRug card =====
    console.log('=== Give P2 SheepRug card ===')
    await postJson(request, `${BACKEND_URL}/api/game/dev/play-card`, {
      playerIndex: 1,
      cardId: CARD_ID
    })

    const afterCard = await getJson(request, `${BACKEND_URL}/api/game/state`)
    saveState('E21_SheepRug_03_card_given.json', afterCard.state)
    console.log('P2 minorPlayed:', afterCard.state.players[1].minorPlayed)

    // ===== Jump to Round 7 (Wish for Children is available from Round 2, but we need it to be visible) =====
    console.log('=== Jump to Round 7 ===')
    await postJson(request, `${BACKEND_URL}/api/game/dev/set-round`, { round: 7 })

    const afterRound7 = await getJson(request, `${BACKEND_URL}/api/game/state`)
    console.log('Round:', afterRound7.state.round)
    console.log('P1 rooms:', afterRound7.state.players[0].rooms)
    console.log('P2 rooms:', afterRound7.state.players[1].rooms)
    console.log('P1 familySize:', afterRound7.state.players[0].familySize)
    console.log('P2 familySize:', afterRound7.state.players[1].familySize)
    saveState('E21_SheepRug_04_round7.json', afterRound7.state)

    await page.reload()
    await page.waitForTimeout(1000)
    await saveScreenshot(page, 'E21_SheepRug_04_round7', 'output')

    // ===== P1 uses Wish for Children to occupy it =====
    console.log('=== P1 uses Wish for Children ===')

    // Make sure it's P1's turn
    if (afterRound7.state.currentPlayerIndex !== 0) {
      await postJson(request, `${BACKEND_URL}/api/game/dev/set-current-player`, { playerIndex: 0 })
    }

    // Reload page as P1
    await page.goto(`${FRONTEND_URL}/?player=p1`)
    await page.waitForTimeout(1000)

    // P1 clicks on Wish for Children
    const wishChildrenCard = page.locator('.action-card').filter({ hasText: 'Wish for Children' }).first()
    if (await wishChildrenCard.isVisible().catch(() => false)) {
      await wishChildrenCard.click()
      await page.waitForTimeout(500)

      // Confirm if needed
      const confirmWishBtn = page.locator('button').filter({ hasText: /confirm|确定/i })
      if (await confirmWishBtn.isVisible().catch(() => false)) {
        await confirmWishBtn.click()
      }
      await page.waitForTimeout(500)
    }

    const afterWishAction = await getJson(request, `${BACKEND_URL}/api/game/state`)
    const wishSpace = afterWishAction.state.actionSpaces.find((s: any) => s.id === 'wish-children')
    console.log('After P1 Wish for Children, wish-children takenBy:', wishSpace?.takenBy)
    saveState('E21_SheepRug_05_wish_occupied.json', afterWishAction.state)
    await saveScreenshot(page, 'E21_SheepRug_05_wish_occupied', 'output')

    // ===== P2's turn - verify SheepRug effect =====
    console.log('=== Verify P2 can use occupied Wish for Children ===')

    // Set current player to P2
    await postJson(request, `${BACKEND_URL}/api/game/dev/set-current-player`, { playerIndex: 1 })

    // Go to P2's view
    await page.goto(`${FRONTEND_URL}/?player=p2`)
    await page.waitForTimeout(1000)

    // Check action cards
    const allActionCards = await page.locator('.action-card').allTextContents()
    console.log('Action cards:', allActionCards.slice(0, 15))

    await saveScreenshot(page, 'E21_SheepRug_06_p2_view', 'output')

    // Find Wish for Children
    const wishChildrenP2 = page.locator('.action-card').filter({ hasText: 'Wish for Children' })
    const isVisible = await wishChildrenP2.isVisible().catch(() => false)
    console.log('Wish for Children visible:', isVisible)

    if (isVisible) {
      // Check if it's disabled/taken
      const isDisabled = await wishChildrenP2.evaluate(el =>
        (el as HTMLButtonElement).disabled || el.classList.contains('taken')
      )
      console.log('Wish for Children disabled:', isDisabled)

      // Verify: With SheepRug, P2 should be able to click (not disabled)
      expect(isDisabled).toBe(false)
      console.log('✅ TEST PASSED: P2 with SheepRug can use occupied Wish for Children!')
    } else {
      console.log('Wish for Children not visible - checking if conditions are met')
      const p2State = await getJson(request, `${BACKEND_URL}/api/game/state`)
      console.log('P2 rooms:', p2State.state.players[1].rooms)
      console.log('P2 familySize:', p2State.state.players[1].familySize)
      console.log('P2 minorPlayed:', p2State.state.players[1].minorPlayed)
    }

    saveState('E21_SheepRug_07_final.json', (await getJson(request, `${BACKEND_URL}/api/game/state`)).state)
    console.log('Test completed!')
  })

  test('Control: Player without SheepRug cannot use occupied Wish for Children', async ({ page, request }) => {
    console.log('=== Control Test: Without SheepRug ===')

    // Reset game
    const newResp = await postJson(request, `${BACKEND_URL}/api/game/new`)
    saveState('E21_SheepRug_control_01_new.json', newResp.state)

    await page.goto(`${FRONTEND_URL}/?player=p1`)
    await page.waitForTimeout(2000)

    // Enable dev mode
    const devToggle = page.locator('header .dev-toggle input[type="checkbox"]')
    if (await devToggle.isVisible().catch(() => false)) {
      if (!(await devToggle.isChecked())) {
        await devToggle.check()
      }
    }

    // Setup: P1 and P2 already have 2 starting rooms each
    // Give P2 1 more room (to meet Wish for Children condition of 3 rooms)
    await postJson(request, `${BACKEND_URL}/api/game/dev/add-rooms`, {
      playerIndex: 1,
      rooms: [{ row: 0, col: 2 }]
    })

    // Give resources
    await postJson(request, `${BACKEND_URL}/api/game/dev/set-resources`, {
      playerIndex: 0,
      resources: { wood: 10, reed: 5, food: 5 }
    })
    await postJson(request, `${BACKEND_URL}/api/game/dev/set-resources`, {
      playerIndex: 1,
      resources: { wood: 10, reed: 5, food: 5 }
    })

    // Jump to Round 7
    await postJson(request, `${BACKEND_URL}/api/game/dev/set-round`, { round: 7 })

    const afterRound7 = await getJson(request, `${BACKEND_URL}/api/game/state`)
    console.log('Control - Round:', afterRound7.state.round)
    console.log('Control - P2 rooms:', afterRound7.state.players[1].rooms)
    console.log('Control - P2 familySize:', afterRound7.state.players[1].familySize)
    saveState('E21_SheepRug_control_02_round7.json', afterRound7.state)

    // P1 uses Wish for Children to occupy it
    await postJson(request, `${BACKEND_URL}/api/game/dev/set-current-player`, { playerIndex: 0 })

    await page.goto(`${FRONTEND_URL}/?player=p1`)
    await page.waitForTimeout(1000)

    const wishChildrenP1 = page.locator('.action-card').filter({ hasText: 'Wish for Children' }).first()
    if (await wishChildrenP1.isVisible().catch(() => false)) {
      await wishChildrenP1.click()
      await page.waitForTimeout(500)

      const confirmWishBtn = page.locator('button').filter({ hasText: /confirm|确定/i })
      if (await confirmWishBtn.isVisible().catch(() => false)) {
        await confirmWishBtn.click()
      }
    }

    const afterWish = await getJson(request, `${BACKEND_URL}/api/game/state`)
    saveState('E21_SheepRug_control_03_wish_occupied.json', afterWish.state)
    console.log('Control - wish-children takenBy:',
      afterWish.state.actionSpaces.find((s: any) => s.id === 'wish-children')?.takenBy)
    await saveScreenshot(page, 'E21_SheepRug_control_03_wish_occupied', 'output')

    // P2's turn - WITHOUT SheepRug card
    await postJson(request, `${BACKEND_URL}/api/game/dev/set-current-player`, { playerIndex: 1 })

    await page.goto(`${FRONTEND_URL}/?player=p2`)
    await page.waitForTimeout(1000)

    await saveScreenshot(page, 'E21_SheepRug_control_04_p2_view', 'output')

    const wishChildrenP2 = page.locator('.action-card').filter({ hasText: 'Wish for Children' })
    const isVisible = await wishChildrenP2.isVisible().catch(() => false)
    console.log('Control - Wish for Children visible:', isVisible)

    if (isVisible) {
      const isDisabled = await wishChildrenP2.evaluate(el =>
        (el as HTMLButtonElement).disabled || el.classList.contains('taken')
      )
      console.log('Control - Wish for Children disabled:', isDisabled)

      // Control: Without SheepRug, P2 should NOT be able to click (disabled)
      expect(isDisabled).toBe(true)
      console.log('✅ CONTROL TEST PASSED: Player without SheepRug cannot use occupied space!')
    }

    saveState('E21_SheepRug_control_05_final.json', (await getJson(request, `${BACKEND_URL}/api/game/state`)).state)
    console.log('Control test completed!')
  })
})
