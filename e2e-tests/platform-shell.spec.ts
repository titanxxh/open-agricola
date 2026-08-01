import { expect, test, type Locator, type Page } from '@playwright/test'

const sandboxSettings = {
  player_count: 2,
  deck_ids: ['A', 'B', 'C', 'D', 'E'],
  enable_through_the_seasons: false,
  enable_farmers_of_the_moor: false,
  allow_incomplete_farmers_of_the_moor_minor_deal: false,
}

async function mockPlatformApis(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('open-agricola-locale-v2', 'en')
  })
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const json = pathname === '/api/auth/me'
      ? { ok: true, user: { id: 'u1', username: 'testuser', displayName: 'Test User' } }
      : { ok: true, cards: [], rooms: [], identities: [], hasMore: false, settings: sandboxSettings }
    await route.fulfill({ json })
  })
}

async function expectFullyWithinViewport(locator: Locator, viewportWidth: number) {
  await expect(locator).toBeVisible()
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth)
}

for (const width of [320, 375, 390]) {
  test(`workshop browse controls fit within a ${width}px viewport`, async ({ page }) => {
    await mockPlatformApis(page)
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/?page=workshop')

    const heading = page.getByRole('heading', { name: 'Browse', exact: true })
    const section = heading.locator('xpath=ancestor::section')
    const elements = [
      heading,
      section.getByText('Browse published cards from other players.', { exact: true }).first(),
      section.getByRole('searchbox', { name: 'Search' }),
      section.getByRole('button', { name: 'Search', exact: true }),
    ]

    for (const element of elements) {
      await expectFullyWithinViewport(element, width)
    }
  })
}

for (const width of [320, 375, 390]) {
  test(`account binding controls fit within a ${width}px viewport`, async ({ page }) => {
    await mockPlatformApis(page)
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/?page=settings')

    for (const link of [
      page.getByRole('link', { name: 'Link GitHub' }),
      page.getByRole('link', { name: 'Link Google' }),
    ]) {
      await expectFullyWithinViewport(link, width)
    }
  })
}

test('button-styled links stay undecorated across interaction states', async ({ page }) => {
  await mockPlatformApis(page)
  await page.goto('/?page=settings')

  for (const link of [
    page.getByRole('link', { name: 'Link GitHub' }),
    page.getByRole('link', { name: 'Link Google' }),
  ]) {
    await expect(link).toHaveCSS('text-decoration-line', 'none')
    await link.hover()
    await expect(link).toHaveCSS('text-decoration-line', 'none')
    await link.focus()
    await expect(link).toHaveCSS('text-decoration-line', 'none')
  }
})

test('the first seasonal background request uses the runtime asset path', async ({ page }) => {
  await mockPlatformApis(page)
  const assetUrl = 'https://raw.githubusercontent.com/titanxxh/open-agricola-assets/a727be4ee9c4dafb4cab792405ecd2033e3bde0f/assets/website-bg/summer-1.webp?v=a727be4ee9c4dafb4cab792405ecd2033e3bde0f'
  const seasonalRequests: string[] = []
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname
    if (pathname.endsWith('/summer-1.webp')) seasonalRequests.push(pathname)
  })

  await page.goto('/?bg=summer-1')
  await expect.poll(() =>
    page.evaluate(() => document.documentElement.style.getPropertyValue('--bg-monthly')),
  ).toContain(assetUrl)

  expect(seasonalRequests[0]).toBe('/titanxxh/open-agricola-assets/a727be4ee9c4dafb4cab792405ecd2033e3bde0f/assets/website-bg/summer-1.webp')
  await expect(page.locator('link[rel="preload"][as="image"]')).toHaveAttribute(
    'href',
    assetUrl,
  )
})

test('lobby omits the duplicate horizon when the seasonal background is disabled', async ({ page }) => {
  await mockPlatformApis(page)
  await page.goto('/?bg=none')

  await expect(page.getByRole('button', { name: 'Create Multiplayer Game' })).toBeVisible()
  await expect(page.locator('.lobby-horizon')).toHaveCount(0)
})
