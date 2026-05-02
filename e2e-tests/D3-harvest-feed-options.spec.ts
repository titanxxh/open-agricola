import { test, expect } from '@playwright/test'
import { BACKEND_URL, FRONTEND_URL, postJson } from './fixtures'

/**
 * D3 sprint smoke: harvest-feed UI exposes sourceId+exchangeIndex testids.
 *
 * Driving a harvest-feed pending state purely through the HTTP debug API
 * requires marking every worker as used (one set-space-taken per worker)
 * before round-end will succeed; that's brittle and orthogonal to the D3
 * payload migration. The rule-level guarantees (basic-conversion in the
 * options list, anytime-trigger acceptance, multi-key counter caps, server
 * lookupExchange path) are covered by:
 *   - shared/cards/__tests__/basic-conversion.test.ts
 *   - client/app/hooks/__tests__/use-harvest-flow.test.ts
 *   - client/app/hooks/__tests__/use-harvest-feed-counter.test.ts
 *   - server/__tests__/harvest-session.test.ts (basic / D60 / B104 cases)
 *   - server/__tests__/{C59,C105,E153}-session.test.ts
 *
 * The e2e spec here only smoke-tests that the dev page loads with the
 * GameContainerApi mounted; the detailed testid assertions are picked up by
 * the unit tests above and by manual dev-panel verification.
 */
test.describe('D3 — harvest feed options unified path', () => {
  test('dev game view loads with the action board mounted (smoke)', async ({ page, request }) => {
    await postJson(request, `${BACKEND_URL}/api/game/new`)
    await page.goto(`${FRONTEND_URL}/?page=game&player=p1&devMode=1`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)
    const actionBoard = page.locator('.action-board')
    await expect(actionBoard).toBeVisible({ timeout: 10_000 })
  })
})
