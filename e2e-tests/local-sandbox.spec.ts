import { test, expect, type Page } from '@playwright/test'

// Browser-local workshop sandbox (VITE_SANDBOX_EXECUTOR=browser). The engine
// and custom card code run entirely in a browser Worker — no server round-trips.
//
// Custom-card execution equivalence with the server isolated-vm executor is
// pinned by server/__tests__/local-sandbox-parity.test.ts; runaway-card timeout
// recovery is pinned by client/local-sandbox/__tests__/local-transport.test.ts.
// This spec covers what only a real browser proves: local boot with zero server
// calls, dev-panel dispatch through the worker, and IndexedDB resume on reload.

const CONFIG = {
  // A custom card with source forces the worker to compile (typescript) and
  // register it — a real-browser proof that new Function works.
  cards: [{
    cardType: 'minor',
    cardJson: { id: 'CUSTOM_E2ECard', name: 'E2E Card', deck: 'CUSTOM', number: 0, desc: ['E2E'] },
    source: [
      "const CARD_ID = 'CUSTOM_E2ECard'",
      "const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'E2E Card' })",
      'const CARD_IMPL = { effect: { id: CARD_ID, onReturnHome: () => gainLeaf(CARD_ID, { food: 1 }) } }',
    ].join('\n'),
    artUrl: null,
  }],
  playerCount: 2,
  seed: 42,
}

const seedAndOpen = async (page: Page): Promise<string[]> => {
  const gameApiCalls: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('/api/game/')) gameApiCalls.push(req.url())
  })
  // devMode + player=p1 → the dev auth shortcut sets user.id to 'p1', so the
  // owner-scoped stash key must match (GameContainerApi uses user?.id ?? 'anon').
  await page.addInitScript((config) => {
    sessionStorage.setItem('open-agricola-local-sandbox-config', JSON.stringify({ owner: 'p1', config }))
  }, CONFIG)
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1&localSandbox=1')
  await expect(page.locator('.action-board, [class*="ActionBoard"]').first())
    .toBeVisible({ timeout: 30_000 })
  return gameApiCalls
}

const addWoodToPlayerA = async (page: Page, amount: number) => {
  await page.locator('.dev-field', { hasText: '资源类型' }).getByRole('combobox').selectOption('wood')
  await page.locator('.dev-field', { hasText: '数量' }).getByRole('spinbutton').fill(String(amount))
  await page.getByRole('button', { name: '增加资源' }).click()
}

test.describe('browser-local sandbox', () => {
  test.skip(process.env.VITE_SANDBOX_EXECUTOR !== 'browser', 'run with VITE_SANDBOX_EXECUTOR=browser')

  test('boots locally with zero server calls and both seats visible', async ({ page }) => {
    const gameApiCalls = await seedAndOpen(page)
    // Debug viewer renders every seat — a single player drives all of them.
    await expect(page.locator('.farm-header', { hasText: 'PlayerA' }).first()).toBeVisible()
    await expect(page.locator('.farm-header', { hasText: 'PlayerB' }).first()).toBeVisible()
    expect(gameApiCalls, `unexpected server calls: ${gameApiCalls.join(', ')}`).toEqual([])
  })

  test('dev panel dispatches through the worker and IndexedDB resumes after reload', async ({ page }) => {
    await seedAndOpen(page)
    const playerAHeader = page.locator('.farm-header', { hasText: 'PlayerA' }).first()

    // devSetResources through the local worker (adds to PlayerA's wood: 0 -> 88).
    await addWoodToPlayerA(page, 88)
    await expect(playerAHeader).toContainText('88')

    // Let the debounced saver flush to IndexedDB, then reload the same tab.
    await page.waitForTimeout(800)
    page.once('dialog', (d) => { void d.accept() }) // "continue previous game?"
    await page.reload()

    // The board comes back from the persisted snapshot with the wood intact.
    await expect(page.locator('.action-board, [class*="ActionBoard"]').first())
      .toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.farm-header', { hasText: 'PlayerA' }).first()).toContainText('88')
  })
})
