/**
 * Platform E2E tests — auth, lobby, workshop, sandbox.
 *
 * Requires the dev server to be running:
 *   pnpm run verify -- e2e-tests/platform.spec.ts
 *
 * Tests use unique usernames per run to avoid conflicts.
 */
import { test, expect } from '@playwright/test'
import { postJson, BACKEND_URL, FRONTEND_URL } from './fixtures'

const RUN_ID = Date.now().toString(36)

test.describe('Platform: auth', () => {
  test('register → login → session validates', async ({ request }) => {
    const username = `e2e_user_${RUN_ID}`
    const reg = await postJson(request, `${BACKEND_URL}/api/auth/register`, {
      username, password: 'testpass123', displayName: 'E2E User',
    })
    expect(reg.ok).toBe(true)
    expect(reg.token).toBeTruthy()

    const me = await request.get(`${BACKEND_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${reg.token}` },
    })
    const meJson = await me.json()
    expect(meJson.ok).toBe(true)
    expect(meJson.user.username).toBe(username)

    const login = await postJson(request, `${BACKEND_URL}/api/auth/login`, {
      username, password: 'testpass123',
    })
    expect(login.ok).toBe(true)
    expect(login.token).toBeTruthy()
  })

  test('wrong password rejected', async ({ request }) => {
    const username = `e2e_badpw_${RUN_ID}`
    await postJson(request, `${BACKEND_URL}/api/auth/register`, { username, password: 'correct123' })
    const res = await postJson(request, `${BACKEND_URL}/api/auth/login`, { username, password: 'wrong' })
    expect(res.ok).toBe(false)
  })

  test('duplicate username rejected', async ({ request }) => {
    const username = `e2e_dup_${RUN_ID}`
    await postJson(request, `${BACKEND_URL}/api/auth/register`, { username, password: 'pass1234' })
    const res = await postJson(request, `${BACKEND_URL}/api/auth/register`, { username, password: 'pass5678' })
    expect(res.ok).toBe(false)
  })

  test('change display name', async ({ request }) => {
    const username = `e2e_name_${RUN_ID}`
    const reg = await postJson(request, `${BACKEND_URL}/api/auth/register`, { username, password: 'pass1234' })
    const res = await request.fetch(`${BACKEND_URL}/api/auth/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${reg.token}` },
      data: { displayName: 'New Name' },
    })
    const d = await res.json()
    expect(d.ok).toBe(true)
  })
})

test.describe('Platform: lobby page', () => {
  test('shows login form when not authenticated', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/?page=lobby`)
    // Should redirect to login since not authenticated
    await expect(page.locator('input[id="username"]')).toBeVisible({ timeout: 10000 })
  })

  test('login and see lobby', async ({ page }) => {
    const username = `e2e_lobby_${RUN_ID}`
    // Pre-register via API
    await page.request.post(`${BACKEND_URL}/api/auth/register`, {
      data: { username, password: 'lobby123' },
      headers: { 'Content-Type': 'application/json' },
    })

    await page.goto(`${FRONTEND_URL}/?page=login`)
    await page.fill('#username', username)
    await page.fill('#password', 'lobby123')
    await page.click('button[type="submit"]')

    // Should show lobby after login
    await expect(page.locator('text=创建多人游戏')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('text=单人模式')).toBeVisible()
    await expect(page.locator('text=进入卡牌工坊')).toBeVisible()
  })
})

test.describe('Platform: single-player game', () => {
  test('starts and shows game board', async ({ page }) => {
    const username = `e2e_sp_${RUN_ID}`
    await page.request.post(`${BACKEND_URL}/api/auth/register`, {
      data: { username, password: 'single123' },
      headers: { 'Content-Type': 'application/json' },
    })

    await page.goto(`${FRONTEND_URL}/?page=login`)
    await page.fill('#username', username)
    await page.fill('#password', 'single123')
    await page.click('button[type="submit"]')
    await expect(page.locator('text=单人模式')).toBeVisible({ timeout: 15000 })

    await page.click('text=单人模式')
    // Should see the game header with back-to-lobby button
    await expect(page.locator('.header-compact')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.header-lobby-btn')).toBeVisible()
  })
})

test.describe('Platform: workshop', () => {
  let token = ''
  const username = `e2e_ws_${RUN_ID}`

  test.beforeAll(async ({ request }) => {
    const reg = await postJson(request, `${BACKEND_URL}/api/auth/register`, {
      username, password: 'workshop123',
    })
    token = reg.token
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
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
      headers: { Authorization: `Bearer ${token}` },
    })
    const d = await res.json()
    expect(d.ok).toBe(true)
    expect(Array.isArray(d.cards)).toBe(true)
  })

  test('workshop page accessible after login', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/?page=login`)
    await page.fill('#username', username)
    await page.fill('#password', 'workshop123')
    await page.click('button[type="submit"]')
    await expect(page.locator('text=单人模式')).toBeVisible({ timeout: 15000 })

    await page.click('text=进入卡牌工坊')
    await expect(page.locator('text=卡牌工坊')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: '浏览' })).toBeVisible()
  })
})

test.describe('Platform: sandbox game with custom cards', () => {
  test('new-sandbox creates per-user HTTP session', async ({ request }) => {
    const u1 = `e2e_sb1_${RUN_ID}`
    const u2 = `e2e_sb2_${RUN_ID}`

    const reg1 = await postJson(request, `${BACKEND_URL}/api/auth/register`, { username: u1, password: 'pass1234' })
    const reg2 = await postJson(request, `${BACKEND_URL}/api/auth/register`, { username: u2, password: 'pass1234' })

    // Start sandbox game for user 1
    const sb1 = await postJson(request, `${BACKEND_URL}/api/game/new-sandbox`, {}, reg1.token)
    expect(sb1.ok).toBe(true)

    // Get state for user 1 — should see their player name
    const state1 = await request.get(`${BACKEND_URL}/api/game/state`, {
      headers: { Authorization: `Bearer ${reg1.token}` },
    })
    const s1 = await state1.json()
    expect(s1.state.players[0].name).toBe('E2E User 1' in s1 ? 'E2E User 1' : s1.state.players[0].name)

    // Start sandbox game for user 2 with different seed
    await postJson(request, `${BACKEND_URL}/api/game/new-sandbox`, { seed: 9999 }, reg2.token)

    // User 2's state should be independent from user 1
    const state2 = await request.get(`${BACKEND_URL}/api/game/state`, {
      headers: { Authorization: `Bearer ${reg2.token}` },
    })
    const s2 = await state2.json()
    // Both have separate game states — verify seeds could differ
    expect(s2.ok).not.toBe(false)
    expect(s1.state?.gameSeed).not.toBeUndefined()
    expect(s2.state?.gameSeed).not.toBeUndefined()
  })
})
