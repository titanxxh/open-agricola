import assert from 'node:assert/strict'
import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test'

export async function installReleaseLocale(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    if (window.top === window) localStorage.setItem('open-agricola-locale-v2', 'en')
  })
}

export async function submitReleaseLogin(page: Page, apiOrigin: string, credentials: { username: string; password: string }): Promise<void> {
  await page.locator('#username').fill(credentials.username)
  await page.locator('#password').fill(credentials.password)
  const [response] = await Promise.all([
    page.waitForResponse(response => response.url() === `${apiOrigin}/api/auth/login` && response.request().method() === 'POST'),
    page.locator('.login-form button[type="submit"]').click(),
  ])
  assert.equal(response.status(), 200)
}

export async function signOutReleaseSession(page: Page, appUrl: string, apiOrigin: string): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`${appUrl}?page=lobby`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.lobby-page')).toBeVisible({ timeout: 30_000 })
  const [response] = await Promise.all([
    page.waitForResponse(response => response.url() === `${apiOrigin}/api/auth/logout` && response.request().method() === 'POST'),
    page.locator('.lobby-header__right').getByRole('button', { name: 'Sign Out', exact: true }).click(),
  ])
  assert.equal(response.status(), 200)
  await expect(page.locator('#username')).toBeVisible({ timeout: 30_000 })
}

export async function clearOwnReleaseSession(client: APIRequestContext, apiOrigin: string, headers: Record<string, string>): Promise<void> {
  assert.equal((await client.post(`${apiOrigin}/api/auth/logout`, { headers, data: {}, maxRedirects: 0 })).status(), 200)
  assert.equal((await client.get(`${apiOrigin}/api/auth/me`, { headers, maxRedirects: 0 })).status(), 401)
}
