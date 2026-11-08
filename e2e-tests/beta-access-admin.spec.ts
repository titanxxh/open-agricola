// @covers server/beta-access-routes.ts
// @covers server/beta-access-store.ts
// @covers client/app/BetaAccessSettings.tsx
// @covers client/app/RoomInvitePicker.tsx
// @covers client/app/SettingsPage.tsx
// @covers client/contexts/AuthContext.tsx
import { expect, test } from '@playwright/test'
import { startExperimentalFeaturesApp } from './helpers/experimental-features-app'
import { PostgresDatabase } from '../server/database/postgres'

let app: Awaited<ReturnType<typeof startExperimentalFeaturesApp>>
test.beforeAll(async () => { test.setTimeout(180000); app = await startExperimentalFeaturesApp() })
test.afterAll(async () => { await app?.close() })

test('administrator grants and revokes Beta access while existing team rooms remain usable', async ({ browser }, testInfo) => {
  test.setTimeout(120000)
  const administrator = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const ordinary = await browser.newContext()
  try {
    const username = `beta_member_${Date.now().toString(36)}`
    await app.authenticate(administrator, 'e2e_admin', 'Administrator')
    await app.authenticate(ordinary, username, 'Beta Player')
    if (!/^test_[a-f0-9]{32}$/.test(app.environment.DATABASE_SCHEMA ?? '')) throw new Error('Expected an isolated test schema')
    const fixture = new PostgresDatabase({ connectionString: app.environment.DATABASE_URL, schema: app.environment.DATABASE_SCHEMA })
    try {
      await fixture.prepare('UPDATE users SET email=?,email_verified_at=NULL WHERE username=?').run(`${username}@example.com`, username)
    } finally { await fixture.close() }
    const invitationSearch = await administrator.request.get(`${app.apiUrl}/api/lobby/players?prefix=${username}`)
    expect(await invitationSearch.json()).toEqual({ ok: true, players: [] })
    expect((await ordinary.request.get(`${app.apiUrl}/api/admin/beta-access`)).status()).toBe(403)
    const owner = await administrator.newPage(), member = await ordinary.newPage()
    await member.goto(app.appUrl)
    await expect(member.getByRole('button', { name: /^Team game/ })).toHaveCount(0)
    const settingsUrl = new URL(app.appUrl)
    settingsUrl.searchParams.set('page', 'settings')
    await owner.goto(settingsUrl.href)
    const manager = owner.locator('.beta-access-settings')
    await manager.getByRole('combobox', { name: 'Account', exact: true }).fill(username)
    await manager.getByRole('option', { name: `Beta Player @${username}` }).click()
    await manager.getByRole('button', { name: 'Grant', exact: true }).click()
    const row = manager.locator('tbody tr').filter({ hasText: `@${username}` })
    await expect(row).toContainText('Administrator')
    await expect(owner.getByText('Enabled', { exact: true })).toBeVisible()
    await owner.screenshot({ path: testInfo.outputPath('beta-admin-desktop.png'), fullPage: true })
    await owner.setViewportSize({ width: 390, height: 844 })
    expect(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await owner.screenshot({ path: testInfo.outputPath('beta-admin-mobile.png'), fullPage: true })
    await manager.screenshot({ path: testInfo.outputPath('beta-admin-mobile-section.png') })

    await member.reload()
    await expect(member.getByRole('button', { name: /^Team game/ })).toBeVisible()
    await member.getByRole('button', { name: /^Team game/ }).click()
    await member.getByRole('button', { name: 'Create Game', exact: true }).click()
    await expect(member.locator('.team-waiting-room')).toBeVisible()
    const roomId = await member.locator('.ws-invite-roomid strong').textContent()
    expect(roomId).toBeTruthy()

    await row.getByRole('button', { name: 'Revoke', exact: true }).click()
    const confirmation = row.getByRole('dialog')
    await expect(confirmation).toContainText('This takes effect immediately. Existing team rooms are not affected.')
    expect(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await manager.screenshot({ path: testInfo.outputPath('beta-admin-mobile-confirmation.png') })
    await confirmation.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(row).toHaveCount(0)
    await member.reload()
    await expect(member.locator('.team-waiting-room')).toBeVisible()
    await member.getByRole('combobox', { name: 'Choose a team', exact: true }).selectOption('1')
    await expect(member.getByRole('combobox', { name: 'Choose a team', exact: true })).toHaveValue('1')
    await expect(member.locator('.ws-invite-roomid strong')).toHaveText(roomId ?? '')

    await member.goto(app.appUrl)
    await expect(member.getByRole('button', { name: 'Create Multiplayer Game', exact: true })).toBeVisible()
    await expect(member.getByRole('button', { name: /^Team game/ })).toHaveCount(0)
    await expect(member.getByRole('button', { name: /^Multihand game/ })).toHaveCount(0)
    const rejected = await ordinary.request.post(`${app.apiUrl}/api/game/new`, { data: {
      playerCount: 4, teamConfig: { mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'sum' },
    } })
    expect(rejected.status()).toBe(403)
    expect(await rejected.json()).toMatchObject({ code: 'experimental_feature_unavailable', feature: 'team-modes' })
  } finally { await ordinary.close(); await administrator.close() }
})
