/**
 * C022_BasketChair End-to-End Playwright spec.
 *
 * Dev endpoints used (all POST unless noted, body JSON):
 *   POST /api/game/new               — reset to fresh 2-player game
 *   POST /api/game/dev/draw-card     — { playerIndex, cardId } → deal card to hand
 *   POST /api/game/dev/set-resources — { playerIndex, resources } → set resource dict
 *   POST /api/game/dev/set-round     — { round } → jump round counter
 *   POST /api/game/dev/set-current-player — { playerIndex } → force current player
 *   POST /api/game/load              — { state } → reload an arbitrary state snapshot
 *   POST /api/game/action            — { playerIndex, spaceId } → take action
 *   POST /api/game/choice            — { playerIndex, value } → resolve pending choice
 *   POST /api/game/next-player       — confirm next-player pending
 *   GET  /api/game/actions           — ?playerIndex=N → list available actions
 *   GET  /api/game/state             — read current state
 *
 * Note on response structure:
 *   All game endpoints return { ok, state, pending, interaction, … } at the top level.
 *   `pending` and `state` are sibling keys — use resp.pending, NOT resp.state.pending.
 *
 * Note on action space for buying C22:
 *   There is no dedicated `minor-improvement` permanent action space in the standard
 *   2-player game. C22 must be purchased via `meeting-place` (offers an optional
 *   minor-improvement step), matching the session test approach. The test uses the
 *   API to drive the buy, then checks the UI for the resulting overlay state.
 *
 * Scenario:
 *   1. Fresh 2-player game + draw C22 + filler + give reed + jump to round 3.
 *   2. Patch state via /api/game/load to activate P1's third worker (required so
 *      workersAvailable ≥ 1 after forest + meeting-place placements).
 *   3. P1 legitimately takes `forest` (records first round-placement, worker 1).
 *   4. P2 takes any free space (advances turn order).
 *   5. Force P1 as current player; P1 takes `meeting-place`.
 *      → optional minor-improvement choice appears.
 *   6. Accept the optional minor-improvement step → minor-selection choice.
 *   7. Pick C022_BasketChair → pays 1 reed → onBuy fires → optional seq offered.
 *   GOLDEN: accept seq → forest freed, heldWorkerId recorded, place-farmer offered,
 *           pick first free space → assert UI overlay + placed space taken.
 *   SKIP:   skip seq → forest still occupied, no heldWorkerId, no UI overlay.
 */

import { test, expect } from '@playwright/test'
import {
  postJson,
  getJson,
  saveState,
  saveScreenshot,
  BACKEND_URL,
  FRONTEND_URL,
} from './fixtures'

const CARD_ID = 'C022_BasketChair'
const FILLER_MINOR = 'C057_Crudite' // free-cost, no prerequisites — keeps minor-selection >1 option

test.use({ viewport: { width: 1920, height: 1080 } })
test.setTimeout(120_000)

// ---------------------------------------------------------------------------
// Type helpers (avoid 'any' where possible)
// ---------------------------------------------------------------------------
interface Choice { value: string; labelKey?: string }
interface ActionEntry { spaceId: string }

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/** Resolve a confirmNextPlayer pending if present. */
async function maybeConfirmNextPlayer(
  request: Parameters<typeof postJson>[0],
  pendingType: string,
) {
  if (pendingType === 'confirmNextPlayer') {
    await postJson(request, `${BACKEND_URL}/api/game/next-player`)
  }
}

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

/**
 * Reset to a fresh game, draw C22 + filler into P1's minor hand,
 * give P1 resources, jump to round 3, and activate P1's 3rd worker
 * (needed so workersAvailable ≥ 1 after forest + meeting-place placements).
 */
async function setupGame(request: Parameters<typeof postJson>[0]) {
  // 1. Fresh game
  const newResp = await postJson(request, `${BACKEND_URL}/api/game/new`)
  saveState('c22-e2e-00-new.json', newResp.state)

  // 2. Draw C22 + filler into P1's minor hand
  await postJson(request, `${BACKEND_URL}/api/game/dev/draw-card`, {
    playerIndex: 0,
    cardId: CARD_ID,
  })
  await postJson(request, `${BACKEND_URL}/api/game/dev/draw-card`, {
    playerIndex: 0,
    cardId: FILLER_MINOR,
  })

  // 3. Give P1 enough reed (≥1) for C22's cost, plus food buffer
  await postJson(request, `${BACKEND_URL}/api/game/dev/set-resources`, {
    playerIndex: 0,
    resources: { reed: 3, food: 5 },
  })

  // 4. Jump to round 3 (non-harvest; meeting-place is always open)
  await postJson(request, `${BACKEND_URL}/api/game/dev/set-round`, { round: 3 })

  // 5. Activate P1's 3rd worker via state load so workersAvailable ≥ 1
  //    after forest (worker 1) + meeting-place (worker 2) placements.
  const stateResp = await getJson(request, `${BACKEND_URL}/api/game/state`)
  const stateForLoad = stateResp.state
  stateForLoad.players[0].workers.forEach((w: { id: string; isActive: boolean }, idx: number) => {
    if (idx < 3) w.isActive = true
  })
  await postJson(request, `${BACKEND_URL}/api/game/load`, { state: stateForLoad })

  const setupState = await getJson(request, `${BACKEND_URL}/api/game/state`)
  saveState('c22-e2e-01-setup.json', setupState.state)
}

/**
 * Drive the C22 buy flow via API:
 * forest → P2 filler → meeting-place → accept minor → select C22.
 * Returns the response after C22 is selected (pending = optional accept/skip seq).
 */
async function driveC22Buy(request: Parameters<typeof postJson>[0]) {
  // Ensure P1 is current player
  await postJson(request, `${BACKEND_URL}/api/game/dev/set-current-player`, { playerIndex: 0 })

  // P1 takes forest (legitimate first placement → records round-placement for C22's guard)
  const forestResp = await postJson(request, `${BACKEND_URL}/api/game/action`, {
    playerIndex: 0,
    spaceId: 'forest',
  })
  saveState('c22-e2e-step-forest.json', forestResp.state)
  await maybeConfirmNextPlayer(request, forestResp.pending?.type ?? '')

  // P2 takes any available space (advance turn order)
  const p2ActionsResp = await getJson(request, `${BACKEND_URL}/api/game/actions?playerIndex=1`)
  const p2Actions: ActionEntry[] = p2ActionsResp.actions ?? []
  const p2SpaceId = p2Actions[0]?.spaceId
  if (p2SpaceId) {
    const p2Resp = await postJson(request, `${BACKEND_URL}/api/game/action`, {
      playerIndex: 1,
      spaceId: p2SpaceId,
    })
    saveState('c22-e2e-step-p2.json', p2Resp.state)
    await maybeConfirmNextPlayer(request, p2Resp.pending?.type ?? '')
  }

  // Force P1 as current player (may have swapped to P2 after next-player confirm)
  await postJson(request, `${BACKEND_URL}/api/game/dev/set-current-player`, { playerIndex: 0 })

  // P1 takes meeting-place (offers optional minor-improvement as first choice)
  const mpResp = await postJson(request, `${BACKEND_URL}/api/game/action`, {
    playerIndex: 0,
    spaceId: 'meeting-place',
  })
  saveState('c22-e2e-step-meeting-place.json', mpResp.state)

  if (mpResp.pending?.type !== 'choice') {
    throw new Error(`Expected choice after meeting-place, got: ${JSON.stringify(mpResp.pending)}`)
  }

  // Accept the optional minor-improvement step (any option ≠ __skip__)
  const acceptMinorOpt: Choice | undefined = mpResp.pending.options?.find(
    (o: Choice) => o.value !== '__skip__',
  )
  if (!acceptMinorOpt) throw new Error('No accept option in meeting-place choice')

  const acceptMinorResp = await postJson(request, `${BACKEND_URL}/api/game/choice`, {
    playerIndex: 0,
    value: acceptMinorOpt.value,
  })
  saveState('c22-e2e-step-accept-minor.json', acceptMinorResp.state)

  if (acceptMinorResp.pending?.type !== 'choice') {
    throw new Error(`Expected minor-selection choice, got: ${JSON.stringify(acceptMinorResp.pending)}`)
  }

  // Pick C22 from the minor-selection options
  const c22Opt: Choice | undefined = acceptMinorResp.pending.options?.find(
    (o: Choice) => o.value === CARD_ID,
  )
  if (!c22Opt) {
    throw new Error(`C022_BasketChair not found in options: ${JSON.stringify(acceptMinorResp.pending.options)}`)
  }

  const selC22Resp = await postJson(request, `${BACKEND_URL}/api/game/choice`, {
    playerIndex: 0,
    value: CARD_ID,
  })
  saveState('c22-e2e-step-c22-selected.json', selC22Resp.state)
  return selC22Resp
}

/** Navigate to the P1 game view, wait for page load, and return.
 *  Uses ?page=game&player=p1&devMode=1 to:
 *  - bypass the auth requirement (devPlayer + devMode triggers the shortcut in AuthContext)
 *  - land directly on the GameContainerApi page
 */
async function goToP1View(page: Parameters<typeof saveScreenshot>[0]) {
  await page.goto(`${FRONTEND_URL}/?page=game&player=p1&devMode=1`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('C022_BasketChair End-to-End', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // Smoke: page loads without hard JS errors and shows the board
  // ──────────────────────────────────────────────────────────────────────────
  test('smoke: page loads with action board visible and no hard JS errors', async ({
    page,
    request,
  }) => {
    await postJson(request, `${BACKEND_URL}/api/game/new`)

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    // ?page=game&player=p1&devMode=1 bypasses auth and lands directly in GameContainerApi
    await page.goto(`${FRONTEND_URL}/?page=game&player=p1&devMode=1`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    // The action board must be visible
    const actionBoard = page.locator('.action-board')
    await expect(actionBoard).toBeVisible({ timeout: 10_000 })

    // No hard JS runtime errors (filter cosmetic/network noise)
    const hardErrors = errors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('bga-img') &&
        !e.includes('Failed to load resource') &&
        !e.includes('NetworkError') &&
        !e.includes('ERR_'),
    )
    expect(hardErrors).toHaveLength(0)
  })

  // ──────────────────────────────────────────────────────────────────────────
  // Golden path: buy C22, accept recall, verify overlay, place extra farmer
  // ──────────────────────────────────────────────────────────────────────────
  test('golden path: buy C22 via meeting-place, accept recall seq, overlay visible, extra placement', async ({
    page,
    request,
  }) => {
    await setupGame(request)

    // ── Buy C22 through meeting-place ──────────────────────────────────────
    const selC22Resp = await driveC22Buy(request)

    // C22 must be in minorPlayed
    expect(selC22Resp.state.players[0].minorPlayed).toContain(CARD_ID)

    // onBuy must have triggered the optional seq choice (accept / skip)
    expect(selC22Resp.pending.type).toBe('choice')

    const acceptSeqOpt: Choice | undefined = selC22Resp.pending.options?.find(
      (o: Choice) => o.value !== '__skip__',
    )
    expect(acceptSeqOpt).toBeDefined()
    expect(
      selC22Resp.pending.options?.some((o: Choice) => o.value === '__skip__'),
    ).toBe(true)

    // ── Accept the optional seq (recall first worker, offer place-farmer) ──
    const acceptResp = await postJson(request, `${BACKEND_URL}/api/game/choice`, {
      playerIndex: 0,
      value: acceptSeqOpt!.value,
    })
    saveState('c22-e2e-golden-01-after-accept.json', acceptResp.state)
    expect(acceptResp.ok).toBe(true)

    // Forest must be freed — P1's worker recalled from forest
    const forestAfterRecall = acceptResp.state.actionSpaces.find(
      (s: { id: string }) => s.id === 'forest',
    )
    expect(
      forestAfterRecall?.takenBy.some((t: { playerId: string }) => t.playerId === 'p1'),
    ).toBe(false)

    // heldWorkerId must be set in P1's C22 cardState
    const heldWorkerId = acceptResp.state.players[0].cardStates?.[CARD_ID]?.extraData?.heldWorkerId
    expect(heldWorkerId).toBeTruthy()

    // Next pending is the place-farmer choice
    expect(acceptResp.pending.type).toBe('choice')
    const placeFarmerOptions: Choice[] = acceptResp.pending.options ?? []
    // Freed forest should be in the options
    expect(placeFarmerOptions.some((o) => o.value === 'forest')).toBe(true)

    // ── Reload page: assert held-worker overlay is visible ─────────────────
    await goToP1View(page)
    await saveScreenshot(page, 'c22-e2e-golden-02-ui-before-place')

    // The held-worker overlay for C22 must be rendered
    const overlay = page.getByTestId(`played-card-held-worker-${CARD_ID}`)
    await expect(overlay).toBeVisible({ timeout: 10_000 })

    // ── Pick the freed forest for the extra placement ──────────────────────
    // (forest is guaranteed to be in the options per the assertion above)
    const placeResp = await postJson(request, `${BACKEND_URL}/api/game/choice`, {
      playerIndex: 0,
      value: 'forest',
    })
    saveState('c22-e2e-golden-03-after-place.json', placeResp.state)
    expect(placeResp.ok).toBe(true)

    // forest must now be re-occupied by P1
    const forestAfterPlace = placeResp.state.actionSpaces.find(
      (s: { id: string }) => s.id === 'forest',
    )
    expect(
      forestAfterPlace?.takenBy.some((t: { playerId: string }) => t.playerId === 'p1'),
    ).toBe(true)

    // heldWorkerId persists until return-home
    const heldAfterPlace =
      placeResp.state.players[0].cardStates?.[CARD_ID]?.extraData?.heldWorkerId
    expect(heldAfterPlace).toBeTruthy()

    // ── Reload page: overlay still visible, forest shows worker chip ────────
    await goToP1View(page)
    await saveScreenshot(page, 'c22-e2e-golden-04-ui-after-place')

    // Overlay persists while heldWorkerId is set
    await expect(page.getByTestId(`played-card-held-worker-${CARD_ID}`)).toBeVisible({
      timeout: 8_000,
    })

    // forest action-card-holder must show "taken" class
    const forestHolder = page.locator('[data-action-id="forest"]')
    await expect(forestHolder).toHaveClass(/\btaken\b/, { timeout: 5_000 })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // Skip path: decline optional seq → forest stays occupied, no overlay
  // ──────────────────────────────────────────────────────────────────────────
  test('skip path: decline optional seq — forest still occupied, no held-worker overlay', async ({
    page,
    request,
  }) => {
    await setupGame(request)

    // ── Buy C22 through meeting-place ──────────────────────────────────────
    const selC22Resp = await driveC22Buy(request)
    expect(selC22Resp.state.players[0].minorPlayed).toContain(CARD_ID)
    expect(selC22Resp.pending.type).toBe('choice')

    // ── Skip the optional seq ──────────────────────────────────────────────
    const skipResp = await postJson(request, `${BACKEND_URL}/api/game/choice`, {
      playerIndex: 0,
      value: '__skip__',
    })
    saveState('c22-e2e-skip-01-after-skip.json', skipResp.state)
    expect(skipResp.ok).toBe(true)

    // Forest must still hold P1's worker (the worker was NOT recalled)
    const forestAfterSkip = skipResp.state.actionSpaces.find(
      (s: { id: string }) => s.id === 'forest',
    )
    expect(
      forestAfterSkip?.takenBy.some((t: { playerId: string }) => t.playerId === 'p1'),
    ).toBe(true)

    // No heldWorkerId in C22's cardState
    const heldAfterSkip =
      skipResp.state.players[0].cardStates?.[CARD_ID]?.extraData?.heldWorkerId
    expect(heldAfterSkip).toBeFalsy()

    // ── Reload page: no held-worker overlay ───────────────────────────────
    await goToP1View(page)
    await saveScreenshot(page, 'c22-e2e-skip-02-ui')

    // C22 is played but NO held-worker overlay
    const overlay = page.getByTestId(`played-card-held-worker-${CARD_ID}`)
    await expect(overlay).toHaveCount(0)

    // forest space must show a "taken" chip
    const forestHolder = page.locator('[data-action-id="forest"]')
    await expect(forestHolder).toHaveClass(/\btaken\b/, { timeout: 5_000 })
  })
})
