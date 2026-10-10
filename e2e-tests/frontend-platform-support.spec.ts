import { readFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'

const platformStyleFiles = [
  'client/App.css',
  'client/index.css',
  'client/styles/base.css',
  'client/styles/bootstrap-shell.css',
  'client/styles/card-sprite.css',
  'client/styles/components.css',
  'client/styles/pages/game.css',
  'client/styles/pages/lobby.css',
  'client/styles/pages/login.css',
  'client/styles/pages/settings.css',
  'client/styles/pages/workshop.css',
  'client/styles/tokens.css',
]

const sandboxSettings = {
  player_count: 2,
  deck_ids: ['A', 'B', 'C', 'D', 'E'],
  enable_through_the_seasons: false,
  enable_farmers_of_the_moor: false,
  allow_incomplete_farmers_of_the_moor_minor_deal: false,
}

async function mockPlatformApis(page: Page, authenticated = true) {
  await page.addInitScript(() => {
    localStorage.setItem('open-agricola-locale-v2', 'en')
  })
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/api/auth/me') {
      await route.fulfill({
        status: authenticated ? 200 : 401,
        json: authenticated
          ? { ok: true, user: { id: 'u1', username: 'testuser', displayName: 'Test User' } }
          : { ok: false },
      })
      return
    }
    const json = pathname === '/api/auth/registration-policy'
      ? { ok: true, policy: 'open' }
      : { ok: true, cards: [], rooms: [], identities: [], hasMore: false, settings: sandboxSettings }
    await route.fulfill({ json })
  })
}

async function emulateBottomSafeArea(page: Page) {
  await page.addInitScript(() => {
    const applySafeArea = () => {
      document.documentElement.style.setProperty('--safe-area-inset-bottom', '34px')
    }
    if (document.documentElement) applySafeArea()
    else document.addEventListener('readystatechange', applySafeArea, { once: true })
  })
}

async function expectFullyWithinViewport(locator: Locator, viewportWidth: number) {
  await expect(locator).toBeVisible()
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth)
}

function contrastRatio(foreground: string, background: string) {
  const luminance = (color: string) => {
    const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number)
    if (!channels || channels.length !== 3) throw new Error(`Unsupported color: ${color}`)
    const [red, green, blue] = channels.map(channel => {
      const value = channel / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!
  }
  const foregroundLuminance = luminance(foreground)
  const backgroundLuminance = luminance(background)
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
}

test('platform styles avoid transition-all behavior', async () => {
  const styles = await Promise.all(platformStyleFiles.map(file => readFile(file, 'utf8')))

  expect(styles.join('\n')).not.toMatch(/transition\s*:\s*all\b|transition-all\b/)
})

test('normal platform text keeps at least 4.5:1 contrast', async ({ page }) => {
  const styles = await Promise.all([
    readFile('client/styles/tokens.css', 'utf8'),
    readFile('client/styles/components.css', 'utf8'),
  ])
  await page.setContent(`
    <style>${styles.join('\n')}</style>
    <section id="surface" class="section" style="background: var(--color-bg-warm)">
      <p class="section__subtitle" data-contrast>Supporting text</p>
      <div class="form-field"><label data-contrast>Field label</label></div>
      <button class="btn-primary" data-contrast data-own-background type="button">Primary action</button>
    </section>
  `)

  const pairs = await page.locator('[data-contrast]').evaluateAll(elements =>
    elements.map(element => {
      const foreground = getComputedStyle(element).color
      const background = getComputedStyle(
        element.hasAttribute('data-own-background')
          ? element
          : document.querySelector('#surface')!,
      ).backgroundColor
      return { text: element.textContent, foreground, background }
    }),
  )
  for (const pair of pairs) {
    expect(
      contrastRatio(pair.foreground, pair.background),
      `${pair.text}: ${pair.foreground} on ${pair.background}`,
    ).toBeGreaterThanOrEqual(4.5)
  }
})

test('reduced motion removes nonessential platform animation and transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockPlatformApis(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?bg=none')
  await expect(page.getByRole('button', { name: 'Create Multiplayer Game' })).toBeVisible()

  const movingElements = await page.locator('body').evaluate(body => {
    const seconds = (durations: string) => Math.max(...durations.split(',').map(duration => {
      const value = Number.parseFloat(duration)
      return duration.trim().endsWith('ms') ? value / 1000 : value
    }))
    return [...body.querySelectorAll<HTMLElement>('*')]
      .map(element => ({ element, style: getComputedStyle(element) }))
      .filter(({ style }) =>
        (style.animationName !== 'none' && seconds(style.animationDuration) > 0.001)
        || (style.transitionProperty !== 'none' && seconds(style.transitionDuration) > 0.001),
      )
      .slice(0, 20)
      .map(({ element, style }) => ({
        selector: element.id
          ? `#${element.id}`
          : `${element.tagName.toLowerCase()}.${[...element.classList].join('.')}`,
        animation: `${style.animationName} ${style.animationDuration}`,
        transition: `${style.transitionProperty} ${style.transitionDuration}`,
      }))
  })

  expect(movingElements).toEqual([])
})

test('mobile targets and keyboard focus stay large, visible, and unobscured', async ({ page }) => {
  await mockPlatformApis(page)
  await emulateBottomSafeArea(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?page=settings&bg=none')

  const navigation = page.getByRole('navigation', { name: 'Main navigation' })
  const githubButton = page.getByRole('button', { name: 'Link GitHub' })
  await expect(navigation).toBeVisible()
  await expect(githubButton).toBeVisible()
  for (const target of [githubButton, ...await navigation.getByRole('button').all()]) {
    const box = await target.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }

  for (let index = 0; index < 30 && !await githubButton.evaluate(element =>
    element === document.activeElement
  ); index += 1) {
    await page.keyboard.press('Tab')
  }
  await expect(githubButton).toBeFocused()
  const focus = await githubButton.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const navigationRect = document.querySelector('.mobile-tab-bar')!.getBoundingClientRect()
    const style = getComputedStyle(element)
    const ring = Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset)
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      left: rect.left - ring,
      right: rect.right + ring,
      top: rect.top - ring,
      bottom: rect.bottom + ring,
      navigationTop: navigationRect.top,
    }
  })
  expect(focus.outlineStyle).not.toBe('none')
  expect(focus.outlineWidth).toBeGreaterThanOrEqual(2)
  expect(focus.left).toBeGreaterThanOrEqual(0)
  expect(focus.right).toBeLessThanOrEqual(390)
  expect(focus.top).toBeGreaterThanOrEqual(0)
  expect(focus.bottom).toBeLessThanOrEqual(focus.navigationTop)
})

test('mobile shell controls safe area, background, glyphs, and asset readiness', async ({ page }) => {
  await mockPlatformApis(page)
  await emulateBottomSafeArea(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?bg=none')

  const navigation = page.getByRole('navigation', { name: 'Main navigation' })
  await expect(navigation).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  const shell = await page.evaluate(() => {
    const navigation = document.querySelector('.mobile-tab-bar')!
    const tabs = [...navigation.querySelectorAll('.mobile-tab-bar__tab')]
    const bodyStyle = getComputedStyle(document.body)
    const navigationStyle = getComputedStyle(navigation)
    return {
      bodyBackgroundColor: bodyStyle.backgroundColor,
      bodyBackgroundImage: bodyStyle.backgroundImage,
      bodyBackgroundAttachment: bodyStyle.backgroundAttachment,
      bodyPaddingBottom: Number.parseFloat(bodyStyle.paddingBottom),
      fontStatus: document.fonts.status,
      dominicanFaces: [...document.fonts]
        .filter(face => face.family.replaceAll('"', '').replaceAll("'", '') === 'Dominican')
        .map(face => face.status),
      safeAreaGap: window.innerHeight - Math.max(...tabs.map(tab =>
        tab.getBoundingClientRect().bottom
      )),
      navigationBackground: navigationStyle.backgroundImage,
    }
  })
  expect(shell.bodyBackgroundColor).toBe('rgb(197, 165, 118)')
  expect(shell.bodyBackgroundImage).toBe('none')
  expect(shell.bodyBackgroundAttachment).toBe('scroll')
  expect(shell.bodyPaddingBottom).toBeGreaterThanOrEqual(90)
  expect(shell.fontStatus).toBe('loaded')
  expect(shell.dominicanFaces).toContain('loaded')
  expect(shell.safeAreaGap).toBeGreaterThanOrEqual(34)
  expect(shell.navigationBackground).not.toBe('none')

  await expect(navigation.locator('.mobile-tab-bar__icon svg')).toHaveCount(3)
  expect(await navigation.textContent()).not.toMatch(/\p{Extended_Pictographic}|\uFFFD/u)
  const logo = page.getByRole('img', { name: 'Open Agricola logo' })
  await expect(logo).toHaveJSProperty('complete', true)
  expect(await logo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)
})

test('platform navigation stays operable at a 200% effective desktop viewport', async ({ page }) => {
  await mockPlatformApis(page)
  await page.setViewportSize({ width: 640, height: 450 })
  await page.goto('/?bg=none')

  const navigation = page.getByRole('navigation', { name: 'Main navigation' })
  await expect(navigation).toBeVisible()
  await navigation.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Account Settings' })).toBeVisible()
  await page.getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Workshop' })
    .click()
  await expect(page.getByRole('searchbox', { name: 'Search' })).toBeVisible()
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )).toBeLessThanOrEqual(1)
})

for (const width of [320, 375, 390, 768, 1280]) {
  test(`platform pages fit a ${width}px viewport`, async ({ page }) => {
    await mockPlatformApis(page)
    await page.setViewportSize({ width, height: 900 })

    const checkScenario = async (scenario: { url: string; control: () => Locator }) => {
      await page.goto(scenario.url)
      await expectFullyWithinViewport(scenario.control(), width)
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        offenders: [...document.body.querySelectorAll<HTMLElement>('*')]
          .map(element => ({ element, rect: element.getBoundingClientRect() }))
          .filter(({ rect }) => rect.left < -1 || rect.right > document.documentElement.clientWidth + 1)
          .slice(0, 10)
          .map(({ element, rect }) => ({
            selector: element.id
              ? `#${element.id}`
              : `${element.tagName.toLowerCase()}.${[...element.classList].join('.')}`,
            left: rect.left,
            right: rect.right,
          })),
      }))
      expect(layout.overflow, JSON.stringify(layout.offenders)).toBeLessThanOrEqual(1)
    }

    for (const scenario of [
      { url: '/?bg=none', control: () => page.getByRole('button', { name: 'Create Multiplayer Game' }) },
      { url: '/?page=workshop&bg=none', control: () => page.getByRole('searchbox', { name: 'Search' }) },
      { url: '/?page=settings&bg=none', control: () => page.getByRole('button', { name: 'Link GitHub' }) },
    ]) {
      await checkScenario(scenario)
    }

    await page.unroute('**/api/**')
    await mockPlatformApis(page, false)
    for (const scenario of [
      { url: '/?page=login&bg=none', control: () => page.locator('#username') },
      { url: '/?page=onboarding&bg=none', control: () => page.locator('#onboarding-username') },
    ]) {
      await checkScenario(scenario)
    }
  })
}
