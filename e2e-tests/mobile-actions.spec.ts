import { expect, test, type FrameLocator, type Page } from '@playwright/test'
import { FRONTEND_URL } from './fixtures'

const setEnglish = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    localStorage.setItem('open-agricola-locale-v2', 'en')
  })
}

const readSandboxVariants = async (sandbox: FrameLocator) =>
  sandbox.locator('body').evaluate(async () => {
    const response = await fetch('/api/game/state')
    const payload = await response.json() as {
      state?: {
        enableThroughTheSeasons?: boolean
        enableFarmersOfTheMoor?: boolean
      }
    }
    return {
      seasons: payload.state?.enableThroughTheSeasons === true,
      moor: payload.state?.enableFarmersOfTheMoor === true,
    }
  })

const configureAndStartSandbox = async (
  page: Page,
  variants: { seasons: boolean; moor: boolean },
) => {
  await page.goto(`${FRONTEND_URL}/?page=workshop&player=p1&devMode=1`)
  await expect(page.getByTestId('workshop-root')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Enter Sandbox' }).click()
  await page.locator('.ws-sandbox-btns').getByRole('button', { name: 'Start Sandbox' }).click()

  const configured = await page.evaluate(async ({ seasons, moor }) => {
    const response = await fetch('/api/game/new-sandbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seed: 4242,
        customCardIds: [],
        playerCount: 2,
        deckIds: ['A', 'B', 'C', 'D', 'E'],
        enableThroughTheSeasons: seasons,
        enableFarmersOfTheMoor: moor,
        allowIncompleteFarmersOfTheMoorMinorDeal: moor,
      }),
    })
    return response.ok
  }, variants)
  expect(configured).toBe(true)

  const iframe = page.locator('iframe[title="Sandbox"]')
  await iframe.evaluate(async (element: HTMLIFrameElement, runId) => {
    await new Promise<void>((resolve) => {
      element.addEventListener('load', () => resolve(), { once: true })
      const url = new URL(element.src)
      url.searchParams.set('sandboxRun', runId)
      element.src = url.toString()
    })
  }, Date.now().toString())
  const sandbox = page.frameLocator('iframe[title="Sandbox"]')
  await expect(sandbox.locator('.mobile-actions-panel')).toBeVisible({ timeout: 30_000 })
  return sandbox
}

test.describe.configure({ mode: 'serial' })

test('real WebSocket room submits a base action from the mobile task list', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setEnglish(page)
  await page.goto(`${FRONTEND_URL}/?player=p1&transport=ws&room=dev4&devMode=1`)

  const reset = page.getByRole('button', { name: 'Reset' })
  await expect(reset).toBeVisible({ timeout: 30_000 })
  await reset.click()
  await page.getByRole('navigation', { name: 'Game presentation' })
    .getByRole('button', { name: 'Action' })
    .click()

  const panel = page.locator('.mobile-actions-panel')
  const dayLaborer = panel.locator('[data-mobile-action-id="day-laborer"]')
  const food = page.locator('[aria-label^="Food:"]').first()
  await expect(food).toHaveAttribute('aria-label', 'Food: 2')
  const foodBefore = Number((await food.getAttribute('aria-label'))?.split(': ')[1])
  await expect(dayLaborer).toBeEnabled()
  expect((await dayLaborer.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await dayLaborer.click()

  await page.getByRole('navigation', { name: 'Game presentation' })
    .getByRole('button', { name: 'Farm' })
    .click()
  await expect(page.getByLabel(`Food: ${foodBefore + 2}`)).toBeVisible()
  await expect(page.locator('.action-board')).toHaveCount(1)
  await expect(page.locator('.major-improvements')).toHaveCount(1)
  await reset.click()
})

test('workshop variants expose and submit every mobile action family', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setEnglish(page)

  const seasonsSandbox = await configureAndStartSandbox(page, { seasons: true, moor: false })
  await expect.poll(() => readSandboxVariants(seasonsSandbox)).toEqual({
    seasons: true,
    moor: false,
  })
  const seasonTasks = seasonsSandbox.locator(
    '[aria-label="Seasons Board"] [data-mobile-action-id^="season-"]',
  )
  await expect(seasonTasks).toHaveCount(4)
  const enabledSeason = seasonsSandbox.locator(
    '[aria-label="Seasons Board"] [data-mobile-action-id^="season-"]:not([disabled])',
  ).first()
  await expect(enabledSeason).toBeEnabled()
  const seasonRequestPromise = page.waitForRequest((requestEvent) =>
    requestEvent.url().endsWith('/api/game/action') && requestEvent.method() === 'POST')
  await enabledSeason.click()
  const seasonRequest = await seasonRequestPromise
  expect((await seasonRequest.postDataJSON()).spaceId).toMatch(/^season-/)

  const moorSandbox = await configureAndStartSandbox(page, { seasons: false, moor: true })
  const specialActions = moorSandbox.locator('[aria-label="Special Actions"]')
  const specialImages = specialActions.locator('img')
  await expect(specialImages).toHaveCount(2)
  for (const image of await specialImages.all()) {
    await expect(image).toHaveJSProperty('complete', true)
    expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBeGreaterThan(0)
  }
  const cutPeat = specialActions.getByRole('button', { name: 'Cut Peat' })
  await expect(cutPeat).toBeEnabled()
  await cutPeat.click()
  await expect(moorSandbox.locator('.game-presentations')).toHaveAttribute(
    'data-presentation',
    'farm',
  )
  await moorSandbox.getByRole('navigation', { name: 'Game presentation' })
    .getByRole('button', { name: 'Action' })
    .click()
  await expect(cutPeat).toHaveAttribute('aria-pressed', 'true')

  const hiringFair = specialActions.getByRole('button', { name: 'Hiring Fair' })
  await expect(hiringFair).toBeEnabled()
  const specialRequestPromise = page.waitForRequest((requestEvent) =>
    requestEvent.url().endsWith('/api/game/special-action') && requestEvent.method() === 'POST')
  await hiringFair.click()
  const specialRequest = await specialRequestPromise
  expect(await specialRequest.postDataJSON()).toMatchObject({ actionId: 'hiring-fair' })
  await expect(moorSandbox.locator('.mobile-major-improvements .major-improvements')).toBeVisible()

  const combinedSandbox = await configureAndStartSandbox(page, { seasons: true, moor: true })
  await expect(combinedSandbox.locator('[aria-label="Seasons Board"]')).toBeVisible()
  await expect(combinedSandbox.locator('[aria-label="Special Actions"]')).toBeVisible()
  await expect(combinedSandbox.locator('[data-mobile-action-id="meeting-place"]')).toBeVisible()
  await expect(combinedSandbox.locator('.action-board')).toHaveCount(1)
  await expect(combinedSandbox.locator('.major-improvements')).toHaveCount(1)
})
