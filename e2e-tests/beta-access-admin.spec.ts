// @covers server/beta-access-routes.ts
// @covers server/beta-access-store.ts
// @covers client/app/BetaAccessSettings.tsx
// @covers client/app/RoomInvitePicker.tsx
// @covers client/app/SettingsPage.tsx
// @covers client/app/LobbyPage.tsx
// @covers client/app/PrereleaseEntry.tsx
// @covers client/contexts/AuthContext.tsx
import { expect, test, type Page } from '@playwright/test'
import { startHostedReleaseAppWithBetaAccess } from './helpers/beta-access-app'
import { PostgresDatabase } from '../server/database/postgres'

let app: Awaited<ReturnType<typeof startHostedReleaseAppWithBetaAccess>>
test.beforeAll(async () => { test.setTimeout(180000); app = await startHostedReleaseAppWithBetaAccess({ https: true }) })
test.afterAll(async () => { await app?.close() })

async function expectStableLobby(page: Page) {
  await expect(page.getByRole('button', { name: 'Create Multiplayer Game', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Local Hotseat', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Solo game', exact: true })).toBeVisible()
  await expectRemovedBusinessControls(page)
}

async function expectRemovedBusinessControls(page: Page) {
  await expect(page.getByRole('button', { name: /^Team game/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Multihand game/ })).toHaveCount(0)
  await expect(page.getByRole('checkbox', { name: /cooperation rules/i })).toHaveCount(0)
  await expect(page.locator('.team-waiting-room, .multihand-seat-controls, .marketplace-panel')).toHaveCount(0)
}

test('administrator manages Beta qualification with bilingual revocation while main keeps stable game controls', async ({ browser }, testInfo) => {
  test.setTimeout(120000)
  const administrator = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true })
  const ordinary = await browser.newContext({ ignoreHTTPSErrors: true })
  const visitor = await browser.newContext({ ignoreHTTPSErrors: true })
  try {
    const username = `beta_member_${Date.now().toString(36)}`
    await app.authenticate(administrator, 'e2e_admin', 'Administrator')
    await app.authenticate(ordinary, username, 'Beta Player')
    await visitor.addInitScript(() => { localStorage.setItem('open-agricola-locale-v2', 'en') })
    const visitorPage = await visitor.newPage()
    await visitorPage.goto(app.appUrl)
    await expect(visitorPage.getByRole('heading', { name: 'Open Agricola', exact: true })).toBeVisible()
    await expectRemovedBusinessControls(visitorPage)
    await expect(visitorPage.locator('.prerelease-entry')).toHaveCount(0)

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
    await expectStableLobby(member)
    await expect(member.locator('.prerelease-entry')).toHaveCount(0)
    const sameOriginEntry = owner.waitForResponse(response => new URL(response.url()).pathname === '/api/prerelease/entry')
    await owner.goto(app.appUrl)
    const read = await sameOriginEntry
    expect(read.request().headers().origin).toBeUndefined()
    expect(read.status()).toBe(200)
    expect(await read.json()).toEqual({ ok: true, protocolVersion: 1, entry: { kind: 'disabled' } })
    await expectStableLobby(owner)
    await expect(owner.getByRole('button', { name: 'Enter prerelease', exact: true })).toBeDisabled()

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
    await expectStableLobby(member)
    await expect(member.getByRole('button', { name: 'Enter prerelease', exact: true })).toBeDisabled()
    await expect(member.locator('.prerelease-entry')).toContainText('Prerelease is not available yet.')
    expect(await (await ordinary.request.get(`${app.apiUrl}/api/auth/me`)).json()).toMatchObject({ user: { betaAccess: true } })

    await row.getByRole('button', { name: 'Revoke', exact: true }).click()
    let confirmation = row.getByRole('dialog')
    await expect(confirmation).toContainText(`Revoke beta access for @${username}? Prerelease access will stop within 30 seconds. Saved games and other state will be retained.`)
    expect(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await manager.screenshot({ path: testInfo.outputPath('beta-admin-mobile-confirmation-en.png') })
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click()
    await owner.getByRole('button', { name: 'Display language: English', exact: true }).click()
    await owner.getByRole('option', { name: '简体中文', exact: true }).click()
    await row.getByRole('button', { name: '撤销', exact: true }).click()
    confirmation = row.getByRole('dialog')
    await expect(confirmation).toContainText(`撤销 @${username} 的 Beta 资格？预发布访问将在 30 秒内停止，已保存的对局及其他状态会保留。`)
    expect(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await manager.screenshot({ path: testInfo.outputPath('beta-admin-mobile-confirmation-zh.png') })
    await confirmation.getByRole('button', { name: '取消', exact: true }).click()
    await owner.getByRole('button', { name: '界面语言: 简体中文', exact: true }).click()
    await owner.getByRole('option', { name: 'English', exact: true }).click()
    await row.getByRole('button', { name: 'Revoke', exact: true }).click()
    await row.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(row).toHaveCount(0)
    await member.reload()
    await expectStableLobby(member)
    await expect(member.locator('.prerelease-entry')).toHaveCount(0)
    expect(await (await ordinary.request.get(`${app.apiUrl}/api/auth/me`)).json()).toMatchObject({ user: { betaAccess: false } })

    const retainedRooms = await (await ordinary.request.get(`${app.apiUrl}/api/lobby/my-rooms`)).json()
    const commands: string[] = []
    const allocations: string[] = []
    member.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/rooms/locate') allocations.push(request.url())
    })
    member.on('websocket', socket => socket.on('framesent', frame => {
      const payload: unknown = JSON.parse(String(frame.payload))
      if (payload && typeof payload === 'object' && 'type' in payload && typeof payload.type === 'string') commands.push(payload.type)
    }))
    for (const [key, value] of [
      ['teamConfig', JSON.stringify({ mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum' })],
      ['team', '1'], ['multihand', '1'], ['cooperationRules', 'true'],
    ]) {
      const legacy = new URL(app.appUrl)
      legacy.searchParams.set('page', 'game')
      legacy.searchParams.set('transport', 'ws')
      legacy.searchParams.set('players', '4')
      legacy.searchParams.set(key, value)
      await member.goto(legacy.href)
      await expect(member.getByRole('alert')).toContainText('Unsupported game configuration')
      await expect(member.locator('.action-board')).toHaveCount(0)
    }
    expect(commands).toEqual([])
    expect(allocations).toEqual([])
    expect(await (await ordinary.request.get(`${app.apiUrl}/api/lobby/my-rooms`)).json()).toEqual(retainedRooms)
  } finally { await visitor.close(); await ordinary.close(); await administrator.close() }
})
