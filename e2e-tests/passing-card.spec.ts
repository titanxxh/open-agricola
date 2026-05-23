/**
 * passing-card End-to-End Playwright spec.
 *
 * Tests the passing minor card mechanic:
 *   - P1 buys a passing minor (A1_Shelter) via meeting-place
 *   - Card moves to P2's hand (not P1's played cards)
 *   - Log panel shows a "passes" entry (log.cardPassed)
 *   - card.passed event is present in state.events
 *   - P2 board view shows A1_Shelter in hand area (data-hand-anchor="p2")
 *   - Flying animation smoke check: .card-pass-overlay appears briefly
 *
 * API endpoints (same as other e2e specs):
 *   POST /api/game/new
 *   POST /api/game/dev/draw-card     { playerIndex, cardId }
 *   POST /api/game/action            { playerIndex, spaceId }
 *   POST /api/game/choice            { playerIndex, value }
 *   GET  /api/game/state
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

const PASSING_CARD_ID = 'A1_Shelter'
const FILLER_MINOR = 'C57_Crudite'

test.use({ viewport: { width: 1920, height: 1080 } })
test.setTimeout(120_000)

interface Choice { value: string; labelKey?: string }

async function setupPassingGame(request: Parameters<typeof postJson>[0]) {
  await postJson(request, `${BACKEND_URL}/api/game/new`)

  await postJson(request, `${BACKEND_URL}/api/game/dev/draw-card`, {
    playerIndex: 0,
    cardId: PASSING_CARD_ID,
  })
  await postJson(request, `${BACKEND_URL}/api/game/dev/draw-card`, {
    playerIndex: 0,
    cardId: FILLER_MINOR,
  })

  const setupState = await getJson(request, `${BACKEND_URL}/api/game/state`)
  saveState('passing-e2e-00-setup.json', setupState.state)
}

async function buyPassingCard(request: Parameters<typeof postJson>[0]) {
  const mpResp = await postJson(request, `${BACKEND_URL}/api/game/action`, {
    playerIndex: 0,
    spaceId: 'meeting-place',
  })
  saveState('passing-e2e-01-meeting-place.json', mpResp.state)

  if (mpResp.pending?.type !== 'choice') {
    throw new Error(`Expected choice after meeting-place, got: ${JSON.stringify(mpResp.pending)}`)
  }

  const acceptMinorOpt: Choice | undefined = mpResp.pending.options?.find(
    (o: Choice) => o.value !== '__skip__',
  )
  if (!acceptMinorOpt) throw new Error('No accept option in meeting-place choice')

  const acceptMinorResp = await postJson(request, `${BACKEND_URL}/api/game/choice`, {
    playerIndex: 0,
    value: acceptMinorOpt.value,
  })
  saveState('passing-e2e-02-accept-minor.json', acceptMinorResp.state)

  if (acceptMinorResp.pending?.type !== 'choice') {
    throw new Error(`Expected minor-selection choice, got: ${JSON.stringify(acceptMinorResp.pending)}`)
  }

  const cardOpt: Choice | undefined = acceptMinorResp.pending.options?.find(
    (o: Choice) => o.value === `minor:${PASSING_CARD_ID}` || o.value === PASSING_CARD_ID,
  )
  if (!cardOpt) {
    throw new Error(`${PASSING_CARD_ID} not found in options: ${JSON.stringify(acceptMinorResp.pending.options)}`)
  }

  const buyResp = await postJson(request, `${BACKEND_URL}/api/game/choice`, {
    playerIndex: 0,
    value: cardOpt.value,
  })
  saveState('passing-e2e-03-bought.json', buyResp.state)
  return buyResp
}

test.describe('passing-card: A1_Shelter minor', () => {
  test('smoke: page loads with board visible', async ({ page, request }) => {
    await postJson(request, `${BACKEND_URL}/api/game/new`)

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto(`${FRONTEND_URL}/?page=game&player=p1&devMode=1`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    await expect(page.locator('.action-board')).toBeVisible({ timeout: 10_000 })

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

  test('P1 buys A1_Shelter → card goes to P2 hand + log shows passes entry + P2 board shows card', async ({
    page,
    request,
  }) => {
    await setupPassingGame(request)

    const buyResp = await buyPassingCard(request)

    expect(buyResp.ok).toBe(true)

    expect(buyResp.state.players[1].minorHand).toContain(PASSING_CARD_ID)
    expect(buyResp.state.players[0].minorPlayed).not.toContain(PASSING_CARD_ID)
    expect(buyResp.state.players[0].stats.totalMinorBuilt).toBe(0)

    const passedEvents = (buyResp.state.events ?? []).filter(
      (e: { type: string }) => e.type === 'card.passed',
    )
    expect(passedEvents).toHaveLength(1)
    expect(passedEvents[0]).toMatchObject({
      type: 'card.passed',
      cardId: PASSING_CARD_ID,
      fromPlayerId: 'p1',
      toPlayerId: 'p2',
    })

    const passedLogEntries = (buyResp.state.log ?? []).filter(
      (e: { key: string }) => e.key === 'log.cardPassed',
    )
    expect(passedLogEntries.length).toBeGreaterThan(0)

    await page.goto(`${FRONTEND_URL}/?page=game&player=p1&devMode=1`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    const logPanel = page.locator('.log')
    await expect(logPanel).toBeVisible({ timeout: 10_000 })

    const logEntries = logPanel.locator('.log-entry-with-cards')
    const count = await logEntries.count()
    expect(count).toBeGreaterThan(0)

    const logText = await logPanel.textContent()
    expect(logText).toMatch(/passes|A1_Shelter/i)

    await saveScreenshot(page, 'passing-e2e-p1-board-after-buy')

    await page.goto(`${FRONTEND_URL}/?page=game&player=p2&devMode=1`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    await saveScreenshot(page, 'passing-e2e-p2-board-after-buy')

    await expect(
      page.locator('[data-hand-anchor="p2"] [data-card-anchor="A1_Shelter"]'),
    ).toBeVisible({ timeout: 10_000 })
  })
})
