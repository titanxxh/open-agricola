// @covers client/components/interaction/
import { expect, test, type FrameLocator, type Page } from '@playwright/test'
import { FRONTEND_URL, relaunchBrowserSandbox } from './fixtures'

const setEnglish = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    localStorage.setItem('open-agricola-locale-v2', 'en')
  })
}

const configureAndStartSandbox = async (
  page: Page,
  variants: { seasons: boolean; moor: boolean; playerCount?: number },
) => {
  await page.goto(`${FRONTEND_URL}/?page=workshop&player=p1&devMode=1`)
  await expect(page.getByTestId('workshop-root')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Enter Sandbox' }).click()
  await page.locator('.ws-sandbox-btns').getByRole('button', { name: 'Start Sandbox' }).click()
  const iframe = page.locator('iframe[title="Sandbox"]')
  await expect(iframe).toBeVisible({ timeout: 30_000 })

  // Workshop playtests run only in the browser sandbox; fix its deal and variants.
  await relaunchBrowserSandbox(iframe, {
    seed: 4242,
    playerCount: variants.playerCount ?? 2,
    deckIds: ['A', 'B', 'C', 'D', 'E'],
    enableThroughTheSeasons: variants.seasons,
    enableFarmersOfTheMoor: variants.moor,
    allowIncompleteFarmersOfTheMoorMinorDeal: variants.moor,
  })
  const sandbox = page.frameLocator('iframe[title="Sandbox"]')
  await expect(sandbox.locator('.action-board')).toBeVisible({ timeout: 30_000 })
  return sandbox
}

test.describe.configure({ mode: 'serial' })

test('workshop sandbox submits a base action from the graphical board', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setEnglish(page)
  const sandbox = await configureAndStartSandbox(page, { seasons: false, moor: false })

  const dayLaborer = sandbox.locator('[data-action-id="day-laborer"] button').first()
  const food = sandbox.locator('[aria-label^="Food:"]').first()
  await expect(food).toHaveAttribute('aria-label', 'Food: 2')
  const foodBefore = Number((await food.getAttribute('aria-label'))?.split(': ')[1])
  await expect(dayLaborer).toBeEnabled()
  await dayLaborer.click()

  await expect(sandbox.getByLabel(`Food: ${foodBefore + 2}`)).toBeVisible()
  await expect(sandbox.locator('.action-board')).toBeVisible()
  await expect(sandbox.locator('.game-layout__center .farm-grid')).toBeVisible()
  await expect(sandbox.locator('.major-improvements')).toBeVisible()
  await expect(sandbox.locator('.mobile-actions-panel')).toHaveCount(0)
})

test('workshop variants expose every action family as graphical boards', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setEnglish(page)

  const seasonsSandbox = await configureAndStartSandbox(page, { seasons: true, moor: false })
  await expect(seasonsSandbox.locator('[aria-label="Special Actions"]')).toHaveCount(0)
  const seasonButtons = seasonsSandbox.locator(
    '[aria-label="Seasons Board"] .seasons-board__space-button',
  )
  await expect(seasonButtons).toHaveCount(4)
  const enabledSeason = seasonsSandbox.locator(
    '[aria-label="Seasons Board"] .seasons-board__space-button:not([disabled])',
  ).first()
  await expect(enabledSeason).toBeEnabled()
  await expect(seasonsSandbox.locator('[aria-label="Seasons Board"] [role="img"]')).toHaveCount(0)
  await enabledSeason.click()
  // The season space now holds the player's person.
  await expect(seasonsSandbox.locator('[aria-label="Seasons Board"] [role="img"]')).toHaveCount(1)

  const moorSandbox = await configureAndStartSandbox(page, { seasons: false, moor: true })
  await expect(moorSandbox.locator('[aria-label="Seasons Board"]')).toHaveCount(0)
  const specialActions = moorSandbox.locator('[aria-label="Special Actions"]')
  await expect(specialActions.locator('.special-action-card')).toHaveCount(2)
  await expect(specialActions.getByRole('img', { name: 'Remove 1 moor to gain 3 fuel' })).toBeVisible()
  const cutPeat = specialActions.getByRole('button', { name: 'Cut Peat' })
  await expect(cutPeat).toBeEnabled()
  await cutPeat.click()
  await expect(cutPeat).toHaveAttribute('aria-pressed', 'true')
  await expect(moorSandbox.locator('.farm-tile.selectable').first()).toBeVisible()
  await expect(moorSandbox.locator('.action-board')).toBeVisible()

  const hiringFair = specialActions.getByRole('button', { name: 'Hiring Fair' })
  await expect(hiringFair).toBeEnabled()
  await hiringFair.click()
  // The special action ran in the browser sandbox and is used up for this round.
  await expect(hiringFair).toBeDisabled()
  await expect(moorSandbox.locator('.major-improvements')).toBeVisible()

  const combinedSandbox = await configureAndStartSandbox(page, { seasons: true, moor: true })
  await expect(combinedSandbox.locator('[aria-label="Seasons Board"]')).toBeVisible()
  await expect(combinedSandbox.locator('[aria-label="Special Actions"]')).toBeVisible()
  await expect(combinedSandbox.locator('[data-action-id="meeting-place"]')).toBeVisible()
  await expect(combinedSandbox.locator('.game-layout__center .farm-grid')).toBeVisible()
  await expect(combinedSandbox.locator('.major-improvements')).toBeVisible()
})

test('narrow 6-player board keeps its overview and offers touch-size graphical controls', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 })
  await setEnglish(page)
  const sandbox = await configureAndStartSandbox(page, {
    seasons: false,
    moor: false,
    playerCount: 6,
  })

  const copse = sandbox.locator('[data-action-id="copse-56"] button')
  const overviewTarget = await copse.boundingBox()
  expect(overviewTarget?.width).toBeLessThan(44)

  await sandbox.getByRole('button', { name: 'Enlarge action controls' }).click()
  await expect(sandbox.getByRole('button', { name: 'Show full board' })).toHaveAttribute('aria-pressed', 'true')

  const precisionWrapper = sandbox.locator('.action-board-wrapper')
  const scrollState = await precisionWrapper.evaluate((element) => ({
    overflowX: getComputedStyle(element).overflowX,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }))
  expect(scrollState.overflowX).toBe('auto')
  expect(scrollState.scrollWidth).toBeGreaterThan(scrollState.clientWidth)
  expect(await precisionWrapper.evaluate((element) => {
    element.scrollLeft = element.scrollWidth
    return element.scrollLeft
  })).toBeGreaterThan(0)

  const precisionTarget = await copse.boundingBox()
  expect(precisionTarget?.width).toBeGreaterThanOrEqual(44)
  expect(precisionTarget?.height).toBeGreaterThanOrEqual(44)
  await copse.click()
  // The space now holds the player's person.
  await expect(sandbox.locator('[data-action-id="copse-56"] .farmer-holder')).toHaveCount(1)
})
