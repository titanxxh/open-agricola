import { test, expect, type Page } from '@playwright/test'
import { saveScreenshot, saveState, FRONTEND_URL } from './fixtures'

/**
 * PR-5 Task 8 — Simultaneous card draft E2E.
 *
 * Drives the full draft chain in two browsers:
 *   lobby skipped via ?player=p1&transport=ws&draftMode=simultaneous&draftPoolSize=7
 *   → server starts a draft phase room
 *   → p1 sees DraftOverlay immediately
 *   → p2 joins with ?player=p2&transport=ws&room=<id>
 *   → both pick 1 occ + 1 minor per round for 7 rounds
 *   → after round 7 the overlay disappears and the main game board renders
 *
 * Auth is bypassed via the `?player=p1` dev shortcut (see AuthContext:47-55).
 * Draft overlay selectors come from Task 6 (`.draft-overlay`,
 * `.draft-pool-row-occ`, `.draft-pool-row-minor`, `.draft-card`,
 * `.draft-confirm-btn`). The main board is `main.board` (shared with
 * ws-dual-player.spec.ts).
 */
test.use({ viewport: { width: 1920, height: 1080 } })

test.describe('card draft — simultaneous mode', () => {
  test('two-player 7-round draft completes and transitions to game', async ({ browser }) => {
    test.setTimeout(120_000)

    const ctx1 = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
    const ctx2 = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
    const p1 = await ctx1.newPage()
    const p2 = await ctx2.newPage()

    const pickFirstAndConfirm = async (page: Page, label: string) => {
      // Wait for this round's interactive pool to render. When the player has
      // already submitted, the occ/minor sections are hidden (see DraftOverlay
      // `!vm.alreadySubmitted`), so the presence of the occ pool row signals
      // "it is my turn to pick in this round".
      await page.waitForSelector('.draft-pool-row-occ .draft-card', { timeout: 15_000 })
      await page.waitForSelector('.draft-pool-row-minor .draft-card', { timeout: 15_000 })

      const occCard = page.locator('.draft-pool-row-occ .draft-card').first()
      const minorCard = page.locator('.draft-pool-row-minor .draft-card').first()
      await occCard.click()
      await minorCard.click()

      const confirmBtn = page.locator('.draft-confirm-btn')
      await expect(confirmBtn).toBeEnabled()
      await confirmBtn.click()
      console.log(`[${label}] confirmed pick`)
    }

    // Step 1: p1 creates a draft room via URL params (no lobby UI needed).
    console.log('\n=== Step 1: p1 creates draft room ===')
    await p1.goto(`${FRONTEND_URL}/?player=p1&transport=ws&draftMode=simultaneous&draftPoolSize=7`)
    // Wait for either the waiting panel OR the draft overlay — both indicate
    // the create succeeded. In 2-player games the room usually starts only
    // after p2 joins, so we first see the waiting text.
    await p1.waitForFunction(() => {
      const body = document.body.textContent ?? ''
      return /等待玩家加入|waiting for other player/i.test(body)
    }, { timeout: 15_000 })
    await saveScreenshot(p1, 'draft-01-p1-waiting')

    const url1 = new URL(p1.url())
    const roomId = url1.searchParams.get('room')
    expect(roomId, 'roomId should be present in URL after create').toBeTruthy()
    saveState('draft-room', { roomId })
    console.log(`Room ID: ${roomId}`)

    // Step 2: p2 joins. Both should transition to DraftOverlay once the game
    // starts (maxPlayers=2 by default).
    console.log('\n=== Step 2: p2 joins, draft starts ===')
    await p2.goto(`${FRONTEND_URL}/?player=p2&transport=ws&room=${roomId}`)
    await p1.waitForSelector('.draft-overlay', { timeout: 20_000 })
    await p2.waitForSelector('.draft-overlay', { timeout: 20_000 })
    await saveScreenshot(p1, 'draft-02-p1-round1')
    await saveScreenshot(p2, 'draft-02-p2-round1')

    // Step 3: 7 rounds, each player picks first occ + first minor and confirms.
    console.log('\n=== Step 3: run 7 draft rounds ===')
    for (let round = 1; round <= 7; round++) {
      console.log(`--- Round ${round} ---`)
      // Each player confirms independently; server advances the round only
      // when BOTH have submitted for the current round.
      await pickFirstAndConfirm(p1, `p1 R${round}`)
      await pickFirstAndConfirm(p2, `p2 R${round}`)

      if (round < 7) {
        // Both players' DraftOverlay headers should flip to the next round.
        const nextRound = round + 1
        for (const [page, label] of [[p1, 'p1'], [p2, 'p2']] as const) {
          await page.waitForFunction((r) => {
            const el = document.querySelector('.draft-overlay-title')
            return !!el && (el.textContent ?? '').includes(`Round ${r}`)
          }, nextRound, { timeout: 15_000 })
          console.log(`[${label}] advanced to round ${nextRound}`)
        }
      }
    }

    // Step 4: After round 7 the draft phase completes and the main board
    // renders for both players.
    console.log('\n=== Step 4: post-draft game board ===')
    await p1.waitForSelector('.draft-overlay', { state: 'detached', timeout: 20_000 })
    await p2.waitForSelector('.draft-overlay', { state: 'detached', timeout: 20_000 })
    await p1.waitForSelector('main.board', { timeout: 20_000 })
    await p2.waitForSelector('main.board', { timeout: 20_000 })
    await saveScreenshot(p1, 'draft-03-p1-board-after-draft')
    await saveScreenshot(p2, 'draft-03-p2-board-after-draft')

    console.log('\n=== Draft E2E complete ===')
    await ctx1.close()
    await ctx2.close()
  })
})
