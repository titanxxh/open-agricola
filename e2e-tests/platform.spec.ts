import { test, expect, type APIRequestContext, type APIResponse, type BrowserContext, type Page } from '@playwright/test'
import { BACKEND_URL, FRONTEND_URL } from './fixtures'

const RUN_ID = Date.now().toString(36)
const PASSWORD = 'testpass123'

type PlaywrightCookie = Parameters<BrowserContext['addCookies']>[0][number]
type OAuthProvider = 'github' | 'google'
type OAuthHelperProfile = {
  providerUserId: string
  providerLogin?: string
  email?: string
  displayName?: string
  avatarUrl?: string
}

function setCookieHeaders(response: APIResponse): string[] {
  const headers = response.headersArray()
    .filter(header => header.name.toLowerCase() === 'set-cookie')
    .map(header => header.value)
  const fallback = response.headers()['set-cookie']
  return headers.length > 0 || !fallback ? headers : [fallback]
}

function cookieFromSetCookie(header: string, url = FRONTEND_URL): PlaywrightCookie {
  const [nameValue = '', ...attributes] = header.split(';')
  const separator = nameValue.indexOf('=')
  const cookie: PlaywrightCookie = {
    name: nameValue.slice(0, separator),
    value: nameValue.slice(separator + 1),
    url,
  }

  for (const rawAttribute of attributes) {
    const [rawName, rawValue = ''] = rawAttribute.trim().split('=')
    const name = rawName.toLowerCase()
    if (name === 'httponly') cookie.httpOnly = true
    if (name === 'secure') cookie.secure = true
    if (name === 'samesite' && (rawValue === 'Strict' || rawValue === 'Lax' || rawValue === 'None')) {
      cookie.sameSite = rawValue
    }
    if (name === 'max-age' && Number(rawValue) <= 0) cookie.expires = 0
  }

  return cookie
}

function cookieHeaderFromSetCookie(headers: string[], cookieName: string): string {
  const header = headers.find(value => value.startsWith(`${cookieName}=`))
  if (!header) throw new Error(`missing ${cookieName} cookie`)
  return header.split(';')[0]!
}

async function callOAuthHelper(
  request: APIRequestContext,
  provider: OAuthProvider,
  profile: OAuthHelperProfile,
): Promise<{ helper: APIResponse; cookies: string[] }> {
  const helper = await request.post(`${BACKEND_URL}/api/test/oauth/${provider}/callback`, {
    data: profile,
  })
  expect(helper.ok()).toBe(true)
  return { helper, cookies: setCookieHeaders(helper) }
}

async function createUserViaOAuth(
  request: APIRequestContext,
  username: string,
  options: {
    provider?: OAuthProvider
    password?: string
    displayName?: string
    providerUserId?: string
    providerLogin?: string
    email?: string
  } = {},
): Promise<{ cookieHeader: string; cookies: PlaywrightCookie[]; profile: OAuthHelperProfile; provider: OAuthProvider }> {
  const {
    provider = 'github',
    password = PASSWORD,
    displayName = username,
    providerUserId = `${provider}-${username}-${RUN_ID}`,
    providerLogin = username,
    email = `${username}@example.com`,
  } = options
  const profile: OAuthHelperProfile = { providerUserId, providerLogin, email, displayName }
  const { cookies: helperCookies } = await callOAuthHelper(request, provider, profile)
  const onboardingCookie = cookieHeaderFromSetCookie(helperCookies, 'oa_onboarding')

  const complete = await request.post(`${BACKEND_URL}/api/auth/onboarding/complete`, {
    data: { username, displayName, password, confirmPassword: password },
    headers: { Cookie: onboardingCookie },
  })
  expect(complete.ok()).toBe(true)

  const sessionCookies = setCookieHeaders(complete)
    .filter(header => header.startsWith('oa_session='))
    .map(header => cookieFromSetCookie(header))
  return {
    cookieHeader: cookieHeaderFromSetCookie(setCookieHeaders(complete), 'oa_session'),
    cookies: sessionCookies,
    profile,
    provider,
  }
}

async function loginThroughPage(page: Page, username: string, password = PASSWORD) {
  await page.goto(`${FRONTEND_URL}/?page=login`)
  await page.fill('#username', username)
  await page.fill('#password', password)
  await page.click('button[type="submit"]')
  await expect(page.locator('text=创建多人游戏')).toBeVisible({ timeout: 15000 })
}

test.describe('Platform: auth', () => {
  test('new user registers through GitHub helper, completes onboarding, then logs in with password', async ({ page, request }) => {
    const username = `e2e_oauth_${RUN_ID}`
    const { cookies } = await callOAuthHelper(request, 'github', {
      providerUserId: `github-${RUN_ID}`,
      providerLogin: `github-${RUN_ID}`,
      email: `${username}@example.com`,
      displayName: 'OAuth User',
    })
    await page.context().addCookies(cookies.map(header => cookieFromSetCookie(header)))

    await page.goto(`${FRONTEND_URL}/?page=onboarding`)
    await page.fill('#onboarding-username', username)
    await page.fill('#onboarding-password', PASSWORD)
    await page.fill('#onboarding-confirm-password', PASSWORD)
    await page.click('button[type="submit"]')
    await expect(page.locator('text=创建多人游戏')).toBeVisible({ timeout: 15000 })
    await expect.poll(() => page.evaluate(() => localStorage.getItem('open-agricola-token'))).toBeNull()
    expect(await page.context().cookies(FRONTEND_URL)).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'oa_session', httpOnly: true })]),
    )

    await page.context().clearCookies()
    await loginThroughPage(page, username)
  })

  test('new user registers through Google helper and lands in lobby', async ({ page, request }) => {
    const username = `e2e_google_${RUN_ID}`
    const { cookies } = await callOAuthHelper(request, 'google', {
      providerUserId: `google-${RUN_ID}`,
      providerLogin: `google-${RUN_ID}`,
      email: `${username}@example.com`,
      displayName: 'Google OAuth User',
    })
    await page.context().addCookies(cookies.map(header => cookieFromSetCookie(header)))

    await page.goto(`${FRONTEND_URL}/?page=onboarding`)
    await page.fill('#onboarding-username', username)
    await page.fill('#onboarding-password', PASSWORD)
    await page.fill('#onboarding-confirm-password', PASSWORD)
    await page.click('button[type="submit"]')
    await expect(page.locator('text=创建多人游戏')).toBeVisible({ timeout: 15000 })
    expect(await page.context().cookies(FRONTEND_URL)).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'oa_session', httpOnly: true })]),
    )
  })

  test('register tab offers password/email and OAuth registration paths', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/?page=login`)
    await page.getByRole('tab', { name: '注册' }).click()
    const localForm = page.getByRole('form', { name: '使用用户名和邮箱注册' })
    const providerGroup = page.getByRole('group', { name: '其他注册方式' })
    await expect(localForm.locator('#register-username')).toBeVisible()
    await expect(localForm.locator('#register-email')).toBeVisible()
    await expect(localForm.locator('#register-password')).toBeVisible()
    await expect(providerGroup.getByText('使用 GitHub 注册', { exact: true })).toBeVisible()
    await expect(providerGroup.getByText('使用 Google 注册', { exact: true })).toBeVisible()
  })

  test('expired onboarding replaces the form and returns to registration', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/?page=onboarding`)
    await page.fill('#onboarding-username', `expired_${RUN_ID}`)
    await page.fill('#onboarding-password', PASSWORD)
    await page.fill('#onboarding-confirm-password', PASSWORD)
    await page.getByRole('button', { name: '完成注册' }).click()

    await expect(page.getByRole('alert')).toContainText('注册会话已过期')
    await expect(page.locator('#onboarding-username')).toHaveCount(0)
    await page.getByRole('button', { name: '重新注册' }).click()
    await expect(page.getByRole('tab', { name: '注册' })).toHaveAttribute('aria-selected', 'true')
  })

  test('wrong password is rejected with localized message', async ({ page, request }) => {
    const username = `e2e_badpw_${RUN_ID}`
    await createUserViaOAuth(request, username, { password: PASSWORD })
    await page.goto(`${FRONTEND_URL}/?page=login`)
    await page.fill('#username', username)
    await page.fill('#password', 'wrongpass123')
    await page.click('button[type="submit"]')
    await expect(page.getByRole('alert')).toHaveText('用户名或密码不正确')
  })

  test('duplicate username is rejected during OAuth onboarding', async ({ page, request }) => {
    const username = `e2e_dup_${RUN_ID}`
    await createUserViaOAuth(request, username, { password: PASSWORD })
    const { cookies } = await callOAuthHelper(request, 'google', {
      providerUserId: `google-dup-${RUN_ID}`,
      providerLogin: `google-dup-${RUN_ID}`,
      email: `${username}-google@example.com`,
      displayName: 'Duplicate User',
    })
    await page.context().addCookies(cookies.map(header => cookieFromSetCookie(header)))

    await page.goto(`${FRONTEND_URL}/?page=onboarding`)
    await page.fill('#onboarding-username', username)
    await page.fill('#onboarding-password', PASSWORD)
    await page.fill('#onboarding-confirm-password', PASSWORD)
    await page.click('button[type="submit"]')
    await expect(page.getByRole('alert')).toHaveText('用户名已被占用')
  })

  test('change display name through cookie-authenticated API', async ({ request }) => {
    const username = `e2e_name_${RUN_ID}`
    const auth = await createUserViaOAuth(request, username, { password: PASSWORD })
    const res = await request.patch(`${BACKEND_URL}/api/auth/profile`, {
      headers: { Cookie: auth.cookieHeader },
      data: { displayName: 'New Name' },
    })
    expect((await res.json()).ok).toBe(true)
  })

  test('existing linked-user can log in through OAuth helper without onboarding', async ({ page, request }) => {
    const username = `e2e_linked_${RUN_ID}`
    const auth = await createUserViaOAuth(request, username, {
      provider: 'github',
      password: PASSWORD,
      displayName: 'Linked OAuth User',
      providerUserId: `github-linked-${RUN_ID}`,
      providerLogin: `linked-${RUN_ID}`,
      email: `${username}@example.com`,
    })
    await page.context().clearCookies()

    const { cookies } = await callOAuthHelper(request, auth.provider, auth.profile)
    await page.context().addCookies(cookies.map(header => cookieFromSetCookie(header)))

    await page.goto(`${FRONTEND_URL}/?page=lobby`)
    await expect(page.locator('text=创建多人游戏')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#onboarding-username')).toHaveCount(0)
  })

  test('logout-all invalidates another browser context session', async ({ browser, request }) => {
    const username = `e2e_logoutall_${RUN_ID}`
    const auth = await createUserViaOAuth(request, username, {
      provider: 'github',
      password: PASSWORD,
      displayName: 'Logout All User',
      providerUserId: `github-logoutall-${RUN_ID}`,
      providerLogin: `logoutall-${RUN_ID}`,
      email: `${username}@example.com`,
    })
    const secondSession = await callOAuthHelper(request, auth.provider, auth.profile)

    const contextA = await browser.newContext()
    const contextB = await browser.newContext()
    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()

    try {
      await contextA.addCookies(auth.cookies)
      await contextB.addCookies(secondSession.cookies.map(header => cookieFromSetCookie(header)))

      await pageA.goto(`${FRONTEND_URL}/?page=settings`)
      await expect(pageA.getByRole('heading', { name: '账户设置' })).toBeVisible({ timeout: 15000 })
      await pageA.getByRole('button', { name: '登出所有设备' }).click()
      await pageA.getByRole('button', { name: '确认' }).click()
      await expect(pageA.locator('#username')).toBeVisible({ timeout: 15000 })

      await pageB.goto(`${FRONTEND_URL}/?page=lobby`)
      await expect(pageB.locator('#username')).toBeVisible({ timeout: 15000 })
      await expect(pageB.locator('text=创建多人游戏')).toHaveCount(0)
    } finally {
      await contextA.close()
      await contextB.close()
    }
  })

  test('non-fixed devMode url cannot bypass auth', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/?page=game&transport=ws&room=abc123&player=p1&devMode=1`)
    await expect(page.locator('#username')).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Platform: lobby page', () => {
  test('shows login form when not authenticated', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/?page=lobby`)
    await expect(page.locator('#username')).toBeVisible({ timeout: 10000 })
  })

  test('login and see lobby', async ({ page, request }) => {
    const username = `e2e_lobby_${RUN_ID}`
    await createUserViaOAuth(request, username, { password: 'lobby123' })
    await loginThroughPage(page, username, 'lobby123')
    await expect(page.locator('text=单人模式')).toBeVisible()
    await expect(page.locator('text=进入卡牌工坊')).toBeVisible()
  })

  test('creates a room and announces the invitation-copy result', async ({ page, request }) => {
    const username = `e2e_waiting_${RUN_ID}`
    await createUserViaOAuth(request, username, { password: 'waiting123' })
    await loginThroughPage(page, username, 'waiting123')

    await page.getByRole('button', { name: '创建多人游戏' }).click()
    await page.getByRole('button', { name: '创建游戏' }).click()
    await page.getByRole('button', { name: '复制' }).click()

    const feedback = page.getByRole('status').or(page.getByRole('alert'))
    await expect(feedback).toHaveText(/邀请链接已复制。|无法复制邀请链接，请手动复制后重试。/)
  })
})

test.describe('Platform: single-player game', () => {
  test('starts and shows game board', async ({ page, request }) => {
    const username = `e2e_sp_${RUN_ID}`
    await createUserViaOAuth(request, username, { password: 'single123' })
    await loginThroughPage(page, username, 'single123')

    await page.click('text=单人模式')
    await expect(page.locator('.header-compact')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.header-lobby-btn')).toBeVisible()
  })
})

test.describe('Platform: workshop', () => {
  const username = `e2e_ws_${RUN_ID}`
  let cookieHeader = ''

  test.beforeAll(async ({ request }) => {
    const auth = await createUserViaOAuth(request, username, { password: 'workshop123' })
    cookieHeader = auth.cookieHeader
  })

  test('create draft card via API', async ({ request }) => {
    const res = await request.post(`${BACKEND_URL}/api/workshop/cards`, {
      data: {
        card_id: `CUSTOM_E2E_${RUN_ID}`,
        card_type: 'minor',
        name: 'E2E Test Card',
        description: 'Gain 1 <FOOD> on return home',
        card_json: { id: `CUSTOM_E2E_${RUN_ID}`, name: 'E2E Test Card', deck: 'CUSTOM', number: 0, desc: [] },
      },
      headers: { Cookie: cookieHeader },
    })
    const d = await res.json()
    expect(d.ok).toBe(true)
    expect(d.id).toBeTruthy()
  })

  test('browse published workshop cards', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/workshop/cards`)
    const d = await res.json()
    expect(d.ok).toBe(true)
    expect(Array.isArray(d.cards)).toBe(true)
  })

  test('sandbox — get user sandbox', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/workshop/sandbox`, {
      headers: { Cookie: cookieHeader },
    })
    const d = await res.json()
    expect(d.ok).toBe(true)
    expect(Array.isArray(d.cards)).toBe(true)
  })

  test('workshop page accessible after login', async ({ page }) => {
    await loginThroughPage(page, username, 'workshop123')
    await page.click('text=进入卡牌工坊')
    await expect(page.locator('text=卡牌工坊')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: '浏览' })).toBeVisible()
  })
})

test.describe('Platform: sandbox game with custom cards', () => {
  test('new-sandbox creates per-user HTTP session', async ({ request }) => {
    const u1 = `e2e_sb1_${RUN_ID}`
    const u2 = `e2e_sb2_${RUN_ID}`

    const auth1 = await createUserViaOAuth(request, u1, { password: 'pass1234' })
    const auth2 = await createUserViaOAuth(request, u2, { password: 'pass1234' })

    const sb1 = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, {
      data: {},
      headers: { Cookie: auth1.cookieHeader },
    })
    expect((await sb1.json()).ok).toBe(true)

    const state1 = await request.get(`${BACKEND_URL}/api/game/state`, {
      headers: { Cookie: auth1.cookieHeader },
    })
    const s1 = await state1.json()

    await request.post(`${BACKEND_URL}/api/game/new-sandbox`, {
      data: { seed: 9999 },
      headers: { Cookie: auth2.cookieHeader },
    })

    const state2 = await request.get(`${BACKEND_URL}/api/game/state`, {
      headers: { Cookie: auth2.cookieHeader },
    })
    const s2 = await state2.json()
    expect(s2.ok).not.toBe(false)
    expect(s1.state?.gameSeed).not.toBeUndefined()
    expect(s2.state?.gameSeed).not.toBeUndefined()
  })
})
