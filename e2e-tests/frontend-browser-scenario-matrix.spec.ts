import {
  devices,
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type FrameLocator,
  type Locator,
  type Page,
} from '@playwright/test'
import { BACKEND_URL, FRONTEND_URL } from './fixtures'

type LocaleScenario = {
  locale: 'en' | 'zh'
  actionArea: string
  score: string
  log: string
  expand: string
  scoreBreakdown: string[]
  plowPrompt: string
  plowConfirm: string
}

type VariantScenario = {
  seasons: boolean
  moor: boolean
}

const ENGLISH: LocaleScenario = {
  locale: 'en',
  actionArea: 'Action Spaces',
  score: 'Scoring Pad',
  log: 'Action Log',
  expand: 'expand',
  scoreBreakdown: ['Fields', 'Animals', 'Card bonus VP', 'Family members', 'Cards'],
  plowPrompt: 'Select a tile to plow',
  plowConfirm: 'Confirm plow',
}

const CHINESE: LocaleScenario = {
  locale: 'zh',
  actionArea: '行动区',
  score: '计分板',
  log: '行动记录',
  expand: '展开',
  scoreBreakdown: ['田地', '动物', '卡牌加分', '家庭成员', '卡牌分'],
  plowPrompt: '选择要开垦的田地',
  plowConfirm: '确认开垦',
}

const setLocale = async (page: Page, locale: LocaleScenario['locale']) => {
  await page.addInitScript((nextLocale) => {
    localStorage.setItem('open-agricola-locale-v2', nextLocale)
  }, locale)
}

let workshopUserCounter = 0

const cookieValue = (response: APIResponse, cookieName: string) => {
  const header = response.headersArray().find(({ name, value }) =>
    name.toLowerCase() === 'set-cookie' && value.startsWith(`${cookieName}=`),
  )
  if (!header) throw new Error(`missing ${cookieName} cookie`)
  return header.value.split(';')[0]!.slice(cookieName.length + 1)
}

const authenticateWorkshop = async (page: Page, request: APIRequestContext) => {
  const suffix = `${Date.now().toString(36)}_${workshopUserCounter++}`
  const username = `scenario_${suffix}`
  const password = 'scenario-pass-550'
  const oauth = await request.post(`${BACKEND_URL}/api/test/oauth/github/callback`, {
    data: {
      providerUserId: `scenario-github-${suffix}`,
      providerLogin: username,
      email: `${username}@example.com`,
      displayName: username,
    },
  })
  expect(oauth.ok()).toBe(true)
  const onboarding = cookieValue(oauth, 'oa_onboarding')
  const complete = await request.post(`${BACKEND_URL}/api/auth/onboarding/complete`, {
    data: { username, displayName: username, password, confirmPassword: password },
    headers: { Cookie: `oa_onboarding=${onboarding}` },
  })
  expect(complete.ok(), `${complete.status()} ${await complete.text()}`).toBe(true)
  await page.context().addCookies([{
    name: 'oa_session',
    value: cookieValue(complete, 'oa_session'),
    url: FRONTEND_URL,
  }])
}

const configureSandbox = async (page: Page, variants: VariantScenario) => {
  const result = await page.evaluate(async (options) => {
    const response = await fetch('/api/game/new-sandbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seed: 55_000,
        customCardIds: [],
        playerCount: 2,
        deckIds: ['A', 'B', 'C', 'D', 'E'],
        enableThroughTheSeasons: options.seasons,
        enableFarmersOfTheMoor: options.moor,
        allowIncompleteFarmersOfTheMoorMinorDeal: options.moor,
      }),
    })
    return {
      ok: response.ok,
      body: await response.json() as { ok?: boolean; error?: string },
    }
  }, variants)
  expect(result.ok, result.body.error).toBe(true)
  expect(result.body.ok).not.toBe(false)
}

const openStandaloneSandbox = async (
  page: Page,
  locale: LocaleScenario,
  variants: VariantScenario = { seasons: false, moor: false },
) => {
  await setLocale(page, locale.locale)
  await page.goto(`${FRONTEND_URL}/?page=workshop&player=p1&devMode=1&bg=summer-1`)
  await expect(page.getByTestId('workshop-root')).toBeVisible({ timeout: 30_000 })
  await page.evaluate((nextLocale) => {
    localStorage.setItem('open-agricola-locale-v2', nextLocale)
  }, locale.locale)
  await configureSandbox(page, variants)
  await page.goto(
    `${FRONTEND_URL}/?page=game&player=p1&embedded=1&devMode=1&bg=summer-1&sandboxRun=55000`,
  )
  await expect(page.locator('.game-layout')).toBeVisible({ timeout: 30_000 })
}

const openWorkshopSandbox = async (
  page: Page,
  request: APIRequestContext,
  variants: VariantScenario,
): Promise<FrameLocator> => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setLocale(page, ENGLISH.locale)
  await authenticateWorkshop(page, request)
  await page.goto(`${FRONTEND_URL}/?page=workshop&bg=summer-1`)
  await expect(page.getByTestId('workshop-root')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Adjust config' }).click()
  const modal = page.locator('.ws-reset-modal')
  const seasonsToggle = modal.getByRole('checkbox', { name: 'Through the Seasons', exact: true })
  const moorToggle = modal.getByRole('checkbox', { name: 'Farmers of the Moor', exact: true })
  await seasonsToggle.setChecked(variants.seasons)
  await moorToggle.setChecked(variants.moor)
  await expect(seasonsToggle).toBeChecked({ checked: variants.seasons })
  await expect(moorToggle).toBeChecked({ checked: variants.moor })
  if (variants.moor) {
    await modal.getByRole('checkbox', {
      name: 'Allow incomplete Farmers of the Moor minor pool',
    }).setChecked(true)
  }
  const saveResponsePromise = page.waitForResponse(response =>
    response.url().endsWith('/api/workshop/sandbox')
      && response.request().method() === 'POST',
  )
  await modal.getByRole('button', { name: 'Apply to Sandbox' }).click()
  const saveResponse = await saveResponsePromise
  const saveRequest = saveResponse.request().postDataJSON() as {
    settings?: {
      enable_through_the_seasons?: boolean
      enable_farmers_of_the_moor?: boolean
    }
  }
  const saveBody = await saveResponse.text()
  expect(saveResponse.ok(), `${saveResponse.status()} ${saveBody}`).toBe(true)
  expect(saveRequest.settings).toMatchObject({
    enable_through_the_seasons: variants.seasons,
    enable_farmers_of_the_moor: variants.moor,
  })
  await expect(modal).toBeHidden()
  const summary = page.locator('.ws-sandbox-info')
  await expect(summary.getByText('Through the Seasons', { exact: true })).toHaveCount(
    variants.seasons ? 1 : 0,
  )
  await expect(summary.getByText('Farmers of the Moor', { exact: true })).toHaveCount(
    variants.moor ? 1 : 0,
  )
  await page.getByRole('button', { name: 'Enter Sandbox' }).click()
  await page.locator('.ws-sandbox-btns').getByRole('button', { name: 'Start Sandbox' }).click()

  const sandbox = page.frameLocator('iframe[title="Sandbox"]')
  await expect(sandbox.locator('.game-layout')).toBeVisible({ timeout: 30_000 })
  return sandbox
}

const readSandboxVariants = (sandbox: FrameLocator) =>
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

const openFixedRoom = async (
  page: Page,
  room: 'dev2' | 'dev6',
  player: 'p1' | 'p6',
  locale: LocaleScenario,
  viewport = { width: 390, height: 844 },
) => {
  await page.setViewportSize(viewport)
  await setLocale(page, locale.locale)
  await page.goto(
    `${FRONTEND_URL}/?player=${player}&transport=ws&room=${room}&devMode=1&bg=summer-1`,
  )
  await expect(page.locator('.game-layout')).toBeVisible({ timeout: 30_000 })
}

const resetFixedRoom = async (page: Page, seed: number) => {
  await page.locator('.dev-panel .seed-input input').fill(String(seed))
  await page.getByRole('button', { name: /Reset|重开/ }).click()
  await expect(page.locator('[data-action-id="farmland"] button').first()).toBeEnabled()
}

const expectTouchTarget = async (locator: Locator, minSize = 44) => {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThanOrEqual(minSize)
  expect(box!.height).toBeGreaterThanOrEqual(minSize)
}

const completePlowInteraction = async (page: Page, locale: LocaleScenario) => {
  await page.locator('.action-board-precision-toggle').click()
  const farmland = page.locator('[data-action-id="farmland"] button').first()
  await expectTouchTarget(farmland)
  await farmland.click()
  await expect(page.locator('.action-board')).toBeVisible()
  await expect(page.locator('.farm-grid')).toBeVisible()
  await expect(page.locator('.interaction-bar__body')).toContainText(locale.plowPrompt)
  const tile = page.locator('.farm-tile.selectable').first()
  await expectTouchTarget(tile)
  await tile.click()
  const confirm = page.getByRole('button', { name: locale.plowConfirm, exact: true }).last()
  await expectTouchTarget(confirm)
  await confirm.click()
  await expect(page.locator('.farm-tile.field')).toHaveCount(1)
}

const inspectMobileInformation = async (
  page: Page,
  locale: LocaleScenario,
  playerCount: number,
) => {
  await expect(page.locator('.farm-grid')).toBeVisible()

  const information = page.locator('.game-layout__right')
  const scoreSection = information.locator('.section', {
    has: page.locator('.section__title', { hasText: locale.score }),
  })
  const logSection = information.locator('.section', {
    has: page.locator('.section__title', { hasText: locale.log }),
  })
  await scoreSection.getByRole('button', { name: locale.expand }).click()
  await logSection.getByRole('button', { name: locale.expand }).click()
  await expect(scoreSection.locator('.score-panel__row')).toHaveCount(playerCount)
  for (const label of locale.scoreBreakdown) {
    await expect(scoreSection).toContainText(label)
  }
  await expect(logSection.locator('.action-log__entry').first()).toBeVisible()
}

const GAMEPLAY_VIEWPORTS = [
  { width: 375, height: 812, orientation: 'portrait' },
  { width: 390, height: 844, orientation: 'portrait' },
  { width: 768, height: 1024, orientation: 'portrait' },
  { width: 900, height: 600, orientation: 'landscape' },
  { width: 1280, height: 800, orientation: 'landscape' },
  { width: 1920, height: 1080, orientation: 'landscape' },
] as const

const WORKSHOP_VARIANTS = [
  { name: 'base', seasons: false, moor: false },
  { name: 'Through the Seasons', seasons: true, moor: false },
  { name: 'Farmers of the Moor', seasons: false, moor: true },
  { name: 'combined expansions', seasons: true, moor: true },
] as const

const IPHONE_13 = {
  userAgent: devices['iPhone 13'].userAgent,
  viewport: devices['iPhone 13'].viewport,
  screen: devices['iPhone 13'].screen,
  deviceScaleFactor: devices['iPhone 13'].deviceScaleFactor,
  isMobile: devices['iPhone 13'].isMobile,
  hasTouch: devices['iPhone 13'].hasTouch,
}

test.describe.configure({ mode: 'serial' })

for (const viewport of GAMEPLAY_VIEWPORTS) {
  test(`base sandbox gameplay fits ${viewport.width}px ${viewport.orientation} @viewport`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await openStandaloneSandbox(page, ENGLISH)

    await expect(page.locator('.action-board')).toBeVisible()
    await expect(page.locator('.farm-grid')).toBeVisible()
    await expect(page.locator('.played-cards')).toBeVisible()
    if (viewport.width <= 900) {
      await expect(page.getByRole('navigation', { name: 'Game presentation' })).toHaveCount(0)
      await expect(page.locator('.game-layout__right')).toBeVisible()
    } else {
      await expect(page.locator('.score-panel')).toBeVisible()
      await expect(page.locator('.action-log')).toBeVisible()
    }

    await expect.poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(1)
  })
}

for (const variants of WORKSHOP_VARIANTS) {
  test(`workshop starts ${variants.name} browser sandbox @workshop`, async ({
    page,
    request,
  }) => {
    const sandbox = await openWorkshopSandbox(page, request, variants)
    await expect.poll(() => readSandboxVariants(sandbox)).toEqual({
      seasons: variants.seasons,
      moor: variants.moor,
    })
    await expect(sandbox.locator('.action-board')).toBeVisible()
    await expect(sandbox.locator('[aria-label="Seasons Board"]')).toHaveCount(
      variants.seasons ? 1 : 0,
    )
    await expect(sandbox.locator('[aria-label="Special Actions"]')).toHaveCount(
      variants.moor ? 1 : 0,
    )

    await expect(sandbox.locator('.farm-grid')).toBeVisible()
    await expect(sandbox.locator('.game-layout__right')).toBeVisible()
  })
}

for (const locale of [CHINESE, ENGLISH]) {
  test(`${locale.locale} completes one mobile farm interaction with matching visible and accessible copy @locale`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openStandaloneSandbox(page, locale)
    await expect(page.locator('html')).toHaveAttribute('lang', locale.locale)

    await expect(page.getByRole('region', { name: locale.actionArea })).toBeVisible()
    await completePlowInteraction(page, locale)
    await inspectMobileInformation(page, locale, 2)
  })
}

test('rule-critical mobile information stays text and asset based @no-emoji', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openStandaloneSandbox(page, ENGLISH)

  const criticalText = await page.locator('.action-board .action-header').allInnerTexts()
  const resourceLabels = await page.locator('.player-resources-compact [aria-label]')
    .evaluateAll(elements => elements.map(element => element.getAttribute('aria-label') ?? ''))
  const resourceImages = await page.locator('.player-resources-compact .res-icon')
    .evaluateAll(elements => elements.map(element => getComputedStyle(element).backgroundImage))

  expect([...criticalText, ...resourceLabels].join(' ')).not.toMatch(
    /\p{Emoji_Presentation}|\uFE0F|\uFFFD/u,
  )
  expect(resourceLabels).toEqual(expect.arrayContaining(['Wood: 0', 'Food: 2']))
  expect(resourceImages.length).toBeGreaterThan(0)
  expect(resourceImages.every(image => image !== 'none')).toBe(true)
})

test.describe('iOS Safari browser smoke @webkit @ios-safari', () => {
  test.use(IPHONE_13)

  test('preserves safe area, background, and zoom through one mobile interaction', async ({
    browserName,
    page,
  }) => {
    test.skip(browserName !== 'webkit', 'run with --browser=webkit')
    await page.addInitScript(() => {
      const applySafeArea = () => {
        document.documentElement.style.setProperty('--safe-area-inset-bottom', '34px')
      }
      if (document.documentElement) applySafeArea()
      else document.addEventListener('readystatechange', applySafeArea, { once: true })
    })
    await openStandaloneSandbox(page, ENGLISH)

    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
    expect(viewport).toContain('viewport-fit=cover')
    expect(viewport).not.toMatch(/maximum-scale|user-scalable\s*=\s*no/)
    const shell = await page.evaluate(() => {
      const body = getComputedStyle(document.body)
      const farm = getComputedStyle(document.querySelector('.farm-grid')!)
      return {
        backgroundImage: body.backgroundImage,
        backgroundAttachment: body.backgroundAttachment,
        farmTouchAction: farm.touchAction,
      }
    })
    expect(shell.backgroundImage).toContain('summer-1.webp')
    expect(shell.backgroundAttachment).toBe('scroll')
    expect(shell.farmTouchAction).toMatch(/pinch-zoom|manipulation/)

    await page.locator('[data-action-id="farmland"] button').first().click()
    await expect(page.locator('.action-board')).toBeVisible()
    await expect(page.locator('.farm-grid')).toBeVisible()
    await expect(page.locator('.interaction-bar__body')).toContainText(ENGLISH.plowPrompt)
    expect(await page.locator('.interaction-bar').evaluate(element =>
      Number.parseFloat(getComputedStyle(element).paddingBottom),
    )).toBeGreaterThanOrEqual(46)
    await page.locator('.farm-tile.selectable').first().click()
    await page.getByRole('button', { name: ENGLISH.plowConfirm, exact: true }).last().click()
    await expect(page.locator('.farm-tile.field')).toHaveCount(1)
    await page.getByRole('button', { name: 'Confirm switch', exact: true }).click()
    await expect.poll(() => page.evaluate(async () => {
      const response = await fetch('/api/game/state')
      const payload = await response.json() as {
        state?: { currentPlayerIndex?: number }
        interaction?: { stateId?: string }
      }
      return {
        currentPlayerIndex: payload.state?.currentPlayerIndex,
        interactionState: payload.interaction?.stateId,
      }
    })).toEqual({ currentPlayerIndex: 1, interactionState: 'idle' })
    await expect.poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(1)
  })
})

test('real WebSocket 2-player boundary completes a farm interaction and inspects score/log @ws', async ({
  page,
}) => {
  await openFixedRoom(page, 'dev2', 'p1', ENGLISH)
  try {
    await resetFixedRoom(page, 55_002)
    await completePlowInteraction(page, ENGLISH)
    await inspectMobileInformation(page, ENGLISH, 2)
  } finally {
    await resetFixedRoom(page, 55_002).catch(() => {})
  }
})

test('real WebSocket 6-player boundary locks p6 identity and observes p1 farm interaction @ws @p6', async ({
  browser,
}) => {
  const p1Context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const p6Context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const p1 = await p1Context.newPage()
  const p6 = await p6Context.newPage()

  try {
    await openFixedRoom(p1, 'dev6', 'p1', ENGLISH)
    await openFixedRoom(p6, 'dev6', 'p6', ENGLISH, { width: 1280, height: 800 })
    await resetFixedRoom(p1, 55_006)

    const p6Tab = p6.locator('.player-tabs__tab[data-player="p6"]')
    await expect.soft(p6Tab).toHaveClass(/is-you/)
    await expect.soft(p6Tab).toHaveAttribute('aria-selected', 'true')

    await completePlowInteraction(p1, ENGLISH)
    await expect(p6.locator('.action-card-holder.taken')).toHaveCount(1)
    await inspectMobileInformation(p1, ENGLISH, 6)
    await expect(p6.locator('.score-panel__row')).toHaveCount(6)
    await expect(p6.locator('.action-log__entry').first()).toBeVisible()
  } finally {
    await resetFixedRoom(p1, 55_006).catch(() => {})
    await p1Context.close()
    await p6Context.close()
  }
})
