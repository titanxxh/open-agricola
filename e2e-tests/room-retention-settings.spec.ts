import { authCookieNames } from '../server/auth-cookies'
// @covers client/app/RoomRetentionSettings.tsx
// @covers client/app/OperationsPage.tsx
// @covers server/retention-policy-routes.ts
// @covers server/game/room-retention-store.ts
import { expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { test } from './server-fixtures'
import { browserRequestHeaders, BACKEND_URL, FRONTEND_URL } from './fixtures'
import { createLocalUserForTests, createSession } from '../server/auth'
import { getDb } from '../server/db'
import { RoomRetentionStore } from '../server/game/room-retention-store'

test.beforeEach(async ({ context }) => {
  expect(process.env.DATABASE_SCHEMA).toMatch(/^test_[a-f0-9]{32}$/)
  expect(process.env.ADMIN_USERS).toBe('e2e_admin')
  const db = getDb()
  const admin = await db.prepare('SELECT id FROM users WHERE username=?').get<{ id: string }>('e2e_admin')
    ?? await createLocalUserForTests('e2e_admin', 'local-retention-password', 'Retention Admin')
  const token = await createSession(admin.id)
  expect(token).toBeTruthy()
  if (!token) throw new Error('Test session was not created')
  await context.addCookies([{ name: authCookieNames().session, value: token, url: BACKEND_URL }])
  const store = new RoomRetentionStore(db), current = await store.read()
  await store.update({ expectedRevision: current.revision, waitingDays: 3, playingDays: 7 }, admin.id)
})

for (const locale of ['en', 'zh']) for (const width of [1440, 375]) {
  test(`administrator saves room retention in ${locale} at ${width}px`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.addInitScript(language => localStorage.setItem('open-agricola-locale-v2', language), locale)
    await page.goto(`${FRONTEND_URL}/?page=operations&bg=none`)
    const labels = locale === 'en'
      ? { title: 'Room retention', waiting: 'Waiting rooms (days)', playing: 'Games in progress (days)', save: 'Save retention settings', saved: 'Retention settings saved.', scope: 'Existing deadlines stay unchanged.' }
      : { title: '房间保留时间', waiting: '等待房间（天）', playing: '进行中对局（天）', save: '保存保留时间', saved: '房间保留时间已保存。', scope: '已经设置的截止时间保持不变。' }
    const form = page.getByRole('form', { name: labels.title })
    await expect(form.getByLabel(labels.waiting, { exact: true })).toHaveValue('3')
    await expect(form.getByLabel(labels.playing, { exact: true })).toHaveValue('7')
    await expect(page.getByText(labels.scope, { exact: false })).toBeVisible()
    await form.getByLabel(labels.waiting, { exact: true }).fill('5')
    await form.getByLabel(labels.playing, { exact: true }).fill('14')
    const saved = page.waitForResponse(response => response.url().endsWith('/api/admin/retention-policy') && response.request().method() === 'PATCH')
    await form.getByRole('button', { name: labels.save, exact: true }).click()
    expect((await saved).status()).toBe(200)
    await expect(page.getByRole('status').filter({ hasText: labels.saved })).toBeVisible()
    expect(await new RoomRetentionStore(getDb()).read()).toMatchObject({ waitingDays: 5, playingDays: 14, updatedBy: 'Retention Admin' })
    const instances = await getDb().prepare("SELECT internal_url FROM app_instances WHERE status='ready' AND lease_until>extract(epoch FROM clock_timestamp())*1000")
      .all<{ internal_url: string }>()
    expect(instances).toHaveLength(Number(process.env.APP_INSTANCES ?? 1))
    for (const instance of instances) {
      expect(new URL(instance.internal_url).hostname).toBe('127.0.0.1')
      const current = await context.request.get(`${instance.internal_url}/api/admin/retention-policy`, { headers: browserRequestHeaders() })
      expect(current.status()).toBe(200)
      expect(await current.json()).toMatchObject({ ok: true, policy: { waitingDays: 5, playingDays: 14 } })
    }
    await page.reload()
    await expect(form.getByLabel(labels.waiting, { exact: true })).toHaveValue('5')
    await expect(form.getByLabel(labels.playing, { exact: true })).toHaveValue('14')
    await form.scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('region', { name: labels.title }).screenshot({ path: testInfo.outputPath(`retention-${locale}-${width}.png`) })
  })
}

test('concurrent administrator edits require an explicit reload', async ({ page, context }) => {
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  await page.goto(`${FRONTEND_URL}/?page=operations&bg=none`)
  const first = page.getByRole('form', { name: 'Room retention' })
  await expect(first.getByLabel('Waiting rooms (days)', { exact: true })).toHaveValue('3')
  await first.getByLabel('Waiting rooms (days)', { exact: true }).fill('5')
  const second = await context.newPage()
  try {
    await second.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
    await second.goto(`${FRONTEND_URL}/?page=operations&bg=none`)
    const other = second.getByRole('form', { name: 'Room retention' })
    await expect(other.getByLabel('Games in progress (days)', { exact: true })).toHaveValue('7')
    await other.getByLabel('Games in progress (days)', { exact: true }).fill('21')
    await other.getByRole('button', { name: 'Save retention settings' }).click()
    await expect(second.getByText('Retention settings saved.', { exact: true })).toBeVisible()
    await first.getByRole('button', { name: 'Save retention settings' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Another administrator changed these settings.' })).toBeVisible()
    await expect(first.getByLabel('Waiting rooms (days)', { exact: true })).toHaveValue('5')
    await expect(first.getByRole('button', { name: 'Save retention settings' })).toBeDisabled()
    await page.getByRole('button', { name: 'Reload current settings' }).click()
    await expect(first.getByLabel('Waiting rooms (days)', { exact: true })).toHaveValue('3')
    await expect(first.getByLabel('Games in progress (days)', { exact: true })).toHaveValue('21')
  } finally { await second.close() }
})

test('ordinary accounts cannot open or change administrator retention settings', async ({ page, context }) => {
  const user = await createLocalUserForTests(`retention_${randomUUID().slice(0, 8)}`, 'ordinary-user-password')
  const token = await createSession(user.id)
  if (!token) throw new Error('Test session was not created')
  await context.clearCookies()
  await context.addCookies([{ name: authCookieNames().session, value: token, url: BACKEND_URL }])
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  await page.goto(`${FRONTEND_URL}/?page=operations&bg=none`)
  await expect(page.getByText('Administrator access required.', { exact: true })).toBeVisible()
  await expect(page.getByRole('form', { name: 'Room retention' })).toHaveCount(0)
  expect((await context.request.get(`${BACKEND_URL}/api/admin/retention-policy`, { headers: browserRequestHeaders() })).status()).toBe(403)
  expect((await context.request.patch(`${BACKEND_URL}/api/admin/retention-policy`, {
    headers: { ...browserRequestHeaders(), Origin: FRONTEND_URL }, data: { expectedRevision: 1, waitingDays: 1, playingDays: 1 },
  })).status()).toBe(403)
})

test('administrator requests from an untrusted Origin cannot change the policy', async ({ context }) => {
  const before = await new RoomRetentionStore(getDb()).read()
  const response = await context.request.patch(`${BACKEND_URL}/api/admin/retention-policy`, {
    headers: { ...browserRequestHeaders(), Origin: 'https://untrusted.example' },
    data: { expectedRevision: before.revision, waitingDays: 1, playingDays: 1 },
  })
  expect(response.status()).toBe(403)
  expect(await response.json()).toMatchObject({ code: 'csrf_rejected' })
  expect(await new RoomRetentionStore(getDb()).read()).toEqual(before)
})

test('administrator can recover from read and save failures without losing edits', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 1000 })
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  let failRead = true, failSave = true
  await page.route('**/api/admin/retention-policy', async route => {
    if (route.request().method() === 'GET' && failRead) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' })
    } else if (route.request().method() === 'PATCH' && failSave) {
      failSave = false
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' })
    } else await route.continue()
  })
  await page.goto(`${FRONTEND_URL}/?page=operations&bg=none`)
  const form = page.getByRole('form', { name: 'Room retention' })
  await expect(page.getByRole('alert').filter({ hasText: 'Room retention settings could not be loaded or saved.' })).toBeVisible()
  await expect(form.getByRole('button', { name: 'Save retention settings' })).toBeDisabled()
  failRead = false
  await page.getByRole('button', { name: 'Reload current settings' }).click()
  await expect(form.getByLabel('Waiting rooms (days)', { exact: true })).toHaveValue('3')
  await form.getByLabel('Waiting rooms (days)', { exact: true }).fill('8')
  await form.getByRole('button', { name: 'Save retention settings' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Room retention settings could not be loaded or saved.' })).toBeVisible()
  await expect(form.getByLabel('Waiting rooms (days)', { exact: true })).toHaveValue('8')
  await page.getByRole('region', { name: 'Room retention' }).screenshot({ path: testInfo.outputPath('retention-save-failure-mobile.png') })
  await form.getByRole('button', { name: 'Save retention settings' }).click()
  await expect(page.getByText('Retention settings saved.', { exact: true })).toBeVisible()
  expect(await new RoomRetentionStore(getDb()).read()).toMatchObject({ waitingDays: 8, playingDays: 7 })
})
