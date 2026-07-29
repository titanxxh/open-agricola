import { test, expect } from '@playwright/test'

/**
 * S6c Phase D smoke: verify the workshop entry route loads through the
 * SandboxApp lazy boundary without throwing.
 *
 * What this guards:
 *   - /?page=workshop renders the workshop UI eventually (the sandbox lazy
 *     chunk fetches and resolves the WorkshopPage React tree).
 *   - the workshop bundle does not raise an uncaught pageerror at import.
 *
 * What this deliberately does NOT cover:
 *   - login flows / authenticated content (requires backend session)
 *   - actual workshop interactions (covered by workshop-pr.spec.ts when ready)
 */
test('workshop opens with lazy-loaded sandbox bundle', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  await page.route('**/client/app/WorkshopPage.tsx*', async route => {
    await new Promise(resolve => setTimeout(resolve, 800))
    await route.continue()
  })
  const workshopRequest = page.waitForRequest(request =>
    request.url().includes('/client/app/WorkshopPage.tsx')
  )

  // `?player=p1&devMode=1` triggers AuthContext's dev shortcut so PageRouter
  // routes to workshop instead of forcing LoginPage. The sandbox lazy chunk
  // is still fetched on first navigation, not at app boot.
  await page.goto('/?page=workshop&player=p1&devMode=1')

  await workshopRequest
  await expect(page.getByRole('link', { name: '返回大厅' })).toBeVisible()
  await expect(page.getByTestId('workshop-root')).toBeVisible({ timeout: 30_000 })

  // Allow a brief grace period for any deferred imports to settle, then assert
  // the page did not raise an uncaught exception.
  await page.waitForTimeout(500)
  expect(errors).toEqual([])
})
