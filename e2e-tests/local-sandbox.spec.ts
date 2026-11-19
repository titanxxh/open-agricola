// @covers client/local-sandbox/
// @covers client/sandbox/
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

const sandboxUrl = '/?page=game&player=p1&embedded=1&devMode=1&localSandbox=1'

const seedAndOpen = async (page: Page): Promise<string[]> => {
  const gameApiCalls: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('/api/game/')) gameApiCalls.push(req.url())
  })
  // devMode + player=p1 → the dev auth shortcut sets user.id to 'p1', so the
  // owner-scoped stash key must match (GameContainerApi uses user?.id ?? 'anon').
  await page.addInitScript((config) => {
    const key = 'open-agricola-local-sandbox-config'
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, JSON.stringify({ owner: 'p1', config }))
    }
  }, CONFIG)
  await page.goto(sandboxUrl)
  await expect(page.locator('.action-board, [class*="ActionBoard"]').first())
    .toBeVisible({ timeout: 30_000 })
  return gameApiCalls
}

const addWoodToPlayerA = async (page: Page, amount: number) => {
  await page.locator('.dev-field', { hasText: '资源类型' }).getByRole('combobox').selectOption('wood')
  await page.locator('.dev-field', { hasText: '数量' }).getByRole('spinbutton').fill(String(amount))
  await page.getByRole('button', { name: '增加资源' }).click()
}

const expectSavedWood = async (page: Page, amount: number) => {
  await expect.poll(() => page.evaluate(() => new Promise<number | undefined>((resolve, reject) => {
    const open = indexedDB.open('open-agricola-local-sandbox')
    open.onupgradeneeded = () => open.transaction?.abort()
    open.onerror = () => resolve(undefined)
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction('games', 'readonly')
      const request = tx.objectStore('games').get('current:p1')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result?.serializedState.state.players[0]?.resources.wood)
      tx.oncomplete = () => db.close()
    }
  }))).toBe(amount)
}

test.describe('browser-local sandbox', () => {
  test.skip(process.env.VITE_SANDBOX_EXECUTOR !== 'browser', 'run with VITE_SANDBOX_EXECUTOR=browser')

  test('boots locally with zero server calls and both seats visible', async ({ page }) => {
    const gameApiCalls = await seedAndOpen(page)
    // Debug viewer renders every seat — a single player drives all of them.
    await expect(page.locator('.farm-header', { hasText: '玩家 1' }).first()).toBeVisible()
    await expect(page.locator('.farm-header', { hasText: '玩家 2' }).first()).toBeVisible()
    expect(gameApiCalls, `unexpected server calls: ${gameApiCalls.join(', ')}`).toEqual([])
  })

  test('dev panel dispatches through the worker and IndexedDB resumes after reload', async ({ page }) => {
    await seedAndOpen(page)
    const playerAHeader = page.locator('.farm-header', { hasText: '玩家 1' }).first()

    // devSetResources through the local worker (adds to the first player's wood: 0 -> 88).
    await addWoodToPlayerA(page, 88)
    await expect(playerAHeader).toContainText('88')

    await expectSavedWood(page, 88)
    page.once('dialog', (d) => { void d.accept() }) // "continue previous game?"
    await page.reload()

    // The board comes back from the persisted snapshot with the wood intact.
    await expect(page.locator('.action-board, [class*="ActionBoard"]').first())
      .toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.farm-header', { hasText: '玩家 1' }).first()).toContainText('88')
  })

  for (const restart of ['explicit restart', 'declining resume']) {
    test(`a rejected Classic setup preserves the saved game after ${restart}`, async ({ page }) => {
      await seedAndOpen(page)
      await addWoodToPlayerA(page, 88)
      await expectSavedWood(page, 88)

      await page.evaluate(config => {
        sessionStorage.setItem('open-agricola-local-sandbox-config', JSON.stringify({
          owner: 'p1',
          config: { ...config, cardEdition: 'classic', enableCommunityDeck: true },
        }))
      }, CONFIG)
      const alerts: string[] = []
      let resume = false
      page.on('dialog', dialog => {
        if (dialog.type() === 'confirm' && !resume) {
          void dialog.dismiss()
          return
        }
        if (dialog.type() === 'alert') alerts.push(dialog.message())
        void dialog.accept()
      })

      await page.goto(restart === 'explicit restart' ? `${sandboxUrl}&freshSandbox=1` : sandboxUrl)
      await expect.poll(() => alerts).toEqual([expect.stringMatching(/classic/i)])
      await expect(page).not.toHaveURL(/freshSandbox/)
      await expectSavedWood(page, 88)

      resume = true
      await page.reload()
      await expect(page.locator('.farm-header', { hasText: '玩家 1' }).first()).toContainText('88', { timeout: 30_000 })
    })
  }
})
