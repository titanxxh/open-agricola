// @covers server/bug-report/feedback-service.ts
// @covers server/bug-report-feedback-routes.ts
// @covers client/app/Inbox.tsx
// @covers client/app/BugReportFeedbackSettings.tsx
// @covers client/app/LobbyPage.tsx
// @covers client/app/GameContainerApi.tsx
// @covers client/app/SettingsPage.tsx
import { expect, test } from '@playwright/test'
import { startHostedReleaseAppWithBetaAccess } from './helpers/beta-access-app'
import { PostgresDatabase } from '../server/database/postgres'

let app: Awaited<ReturnType<typeof startHostedReleaseAppWithBetaAccess>>
test.use({ actionTimeout: 10000 })
test.beforeAll(async () => { test.setTimeout(180000); app = await startHostedReleaseAppWithBetaAccess() })
test.afterAll(async () => { await app?.close() })

test('a signed-in player can open an account inbox without leaving the lobby', async ({ browser }) => {
  const context = await browser.newContext()
  try {
    await app.authenticate(context, `inbox_${Date.now().toString(36)}`, 'Inbox Player')
    const page = await context.newPage()
    await page.goto(app.appUrl)
    await expect(page.getByRole('button', { name: 'Inbox', exact: true })).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: 'Inbox', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Inbox', exact: true })).toBeVisible()
    await expect(page.getByText('No messages yet.', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await context.setOffline(true)
    await page.getByRole('button', { name: 'Inbox', exact: true }).click()
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Could not load or save feedback.')
    await context.setOffline(false)
    await page.getByRole('dialog').getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0)
    await expect(page.getByText('No messages yet.', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Create Multiplayer Game', exact: true })).toBeVisible()
  } finally { await context.close().catch(() => {}) }
})

test('administrator confirmation reaches only the reporter and read state survives reload', async ({ browser }, testInfo) => {
  test.setTimeout(120000)
  const administrator = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const reporter = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const stranger = await browser.newContext()
  try {
    const suffix = Date.now().toString(36)
    const username = `feedback_${suffix}`
    await app.authenticate(administrator, 'e2e_admin', 'Feedback Administrator')
    await app.authenticate(reporter, username, 'Feedback Reporter')
    await app.authenticate(stranger, `other_${suffix}`, 'Other Player')
    if (!/^test_[a-f0-9]{32}$/.test(app.environment.DATABASE_SCHEMA ?? '')) throw new Error('Expected an isolated test schema')
    const fixture = new PostgresDatabase({ connectionString: app.environment.DATABASE_URL, schema: app.environment.DATABASE_SCHEMA })
    const issueNumber = 1671001
    try {
      const account = await fixture.prepare('SELECT id FROM users WHERE username=?').get<{ id: string }>(username)
      if (!account) throw new Error('Reporter fixture missing')
      await fixture.prepare("INSERT INTO game_contexts(room_id,lifecycle,created_at,updated_at) VALUES(?,'expired',1,1)").run(`feedback-${suffix}`)
      await fixture.prepare(`INSERT INTO bug_reports(submission_id,reporter_user_id,room_id,player_index,lifecycle,room_version,step_no,frame_hash,
        status,github_issue_number,github_issue_url,author_identity,created_at,updated_at)
        VALUES(?,?,?,0,'active',1,0,?,'submitted',?,?,'hosted',1,1)`)
        .run(`feedback-${suffix}`, account.id, `feedback-${suffix}`, 'a'.repeat(64), issueNumber,
          `https://github.com/titanxxh/open-agricola/issues/${issueNumber}`)
    } finally { await fixture.close() }

    const rejected = await administrator.request.post(`${app.apiUrl}/api/admin/bug-report-feedback`, {
      headers: { Origin: 'https://untrusted.example' }, data: { issueNumber, requestId: 'untrusted-request', expectedVersion: 0,
        kind: 'confirmed_bug', reportSummary: 'Wrong origin', explanation: 'This must not be delivered.' },
    })
    expect(rejected.status()).toBe(403)
    expect(await (await reporter.request.get(`${app.apiUrl}/api/v1/inbox`)).json()).toMatchObject({ messages: [], unreadCount: 0 })
    expect((await stranger.request.get(`${app.apiUrl}/api/admin/bug-report-feedback?issue=${issueNumber}`)).status()).toBe(403)

    const owner = await administrator.newPage(), member = await reporter.newPage()
    const settings = new URL(app.appUrl); settings.searchParams.set('page', 'settings')
    await owner.goto(settings.href)
    const manager = owner.locator('.bug-report-feedback-settings')
    await expect(manager).toBeVisible({ timeout: 10000 })
    await manager.getByRole('spinbutton', { name: 'GitHub issue number', exact: true }).fill(String(issueNumber))
    await manager.getByRole('button', { name: 'Find report', exact: true }).click()
    await manager.getByRole('textbox', { name: 'Report summary', exact: true }).fill('Resources cannot be discarded')
    await manager.getByRole('textbox', { name: 'Explanation for the reporter', exact: true }).fill('Confirmed: <b>discard</b> is unavailable. We will follow up after release.')
    await manager.getByRole('button', { name: 'Confirm bug and notify', exact: true }).click()
    await expect(manager.getByRole('status')).toHaveText('Feedback sent to the reporter.')
    await expect(manager.locator('.feedback-history')).toContainText('Confirmed: <b>discard</b> is unavailable.')

    await member.goto(app.appUrl)
    await expect(member.getByRole('button', { name: 'Inbox, 1 unread', exact: true })).toBeVisible({ timeout: 10000 })
    await member.getByRole('button', { name: 'Inbox, 1 unread', exact: true }).click()
    const inbox = member.getByRole('dialog', { name: 'Inbox', exact: true })
    await expect(inbox.getByText('Unread', { exact: true })).toBeVisible()
    await inbox.getByRole('button', { name: /Resources cannot be discarded/ }).click()
    await expect(inbox.getByRole('heading', { name: 'Resources cannot be discarded', exact: true })).toBeVisible()
    await expect(inbox.getByText('Bug confirmed', { exact: true })).toBeVisible()
    await expect(inbox.getByRole('link', { name: `View issue #${issueNumber}` })).toHaveAttribute('href', `https://github.com/titanxxh/open-agricola/issues/${issueNumber}`)
    await expect(inbox.locator('b')).toHaveCount(0)
    const delivered: unknown = await (await reporter.request.get(`${app.apiUrl}/api/v1/inbox`)).json()
    if (!delivered || typeof delivered !== 'object' || !('messages' in delivered) || !Array.isArray(delivered.messages)
      || !delivered.messages[0] || typeof delivered.messages[0] !== 'object' || !('id' in delivered.messages[0])
      || typeof delivered.messages[0].id !== 'number') throw new Error('Expected delivered inbox message')
    expect((await stranger.request.get(`${app.apiUrl}/api/v1/inbox/${delivered.messages[0].id}`)).status()).toBe(404)
    await expect.poll(async () => (await (await reporter.request.get(`${app.apiUrl}/api/v1/inbox`)).json()).unreadCount).toBe(0)
    await member.screenshot({ path: testInfo.outputPath('inbox-desktop.png'), fullPage: true })
    await member.keyboard.press('Escape')
    await member.reload()
    await member.getByRole('button', { name: 'Inbox', exact: true }).click()
    await expect(member.getByRole('dialog').getByText('Read', { exact: true })).toBeVisible()
    await member.keyboard.press('Escape')

    await owner.setViewportSize({ width: 390, height: 844 })
    expect(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await manager.screenshot({ path: testInfo.outputPath('feedback-admin-mobile.png') })
    await member.setViewportSize({ width: 390, height: 844 })
    await member.locator('.lobby-menu-toggle').click()
    await member.getByRole('button', { name: 'Display language: English', exact: true }).click()
    await member.getByRole('option', { name: '简体中文', exact: true }).click()
    const chineseInbox = member.getByRole('menuitem', { name: '站内信', exact: true })
    await chineseInbox.focus()
    await member.keyboard.press('Enter')
    const chineseDialog = member.getByRole('dialog', { name: '站内信', exact: true })
    await expect(chineseDialog.getByText('已读', { exact: true })).toBeVisible()
    await chineseDialog.getByRole('button', { name: /Resources cannot be discarded/ }).click()
    await expect(chineseDialog.getByText('已确认 bug', { exact: true })).toBeVisible()
    expect(await member.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await member.screenshot({ path: testInfo.outputPath('inbox-mobile-zh.png'), fullPage: true })
    await member.keyboard.press('Escape')
    await expect(chineseInbox).toBeFocused()
    await member.getByRole('button', { name: '界面语言: 简体中文', exact: true }).click()
    await member.getByRole('option', { name: 'English', exact: true }).click()
    await member.locator('.lobby-drawer__scrim').click({ position: { x: 5, y: 5 } })

    await member.getByRole('button', { name: 'Solo game', exact: true }).click()
    await member.getByRole('dialog', { name: 'Start a solo game', exact: true }).getByRole('button', { name: 'Start solo game', exact: true }).click()
    const gameMenu = member.getByTitle('Menu', { exact: true })
    await expect(gameMenu).toBeVisible({ timeout: 15000 })
    const gameUrl = member.url()
    await gameMenu.click()
    const gameInbox = member.getByRole('button', { name: 'Inbox', exact: true })
    await gameInbox.click()
    const gameDialog = member.getByRole('dialog', { name: 'Inbox', exact: true })
    await gameDialog.getByRole('button', { name: /Resources cannot be discarded/ }).click()
    await expect(gameDialog.getByRole('heading', { name: 'Resources cannot be discarded', exact: true })).toBeVisible()
    await expect(gameMenu).toHaveAttribute('aria-expanded', 'true')
    await member.screenshot({ path: testInfo.outputPath('inbox-game-mobile.png'), fullPage: true })
    await member.keyboard.press('Escape')
    await expect(gameMenu).toHaveAttribute('aria-expanded', 'true')
    await expect(gameInbox).toBeFocused()
    expect(member.url()).toBe(gameUrl)
  } finally { await Promise.allSettled([administrator.close(), reporter.close(), stranger.close()]) }
})

test('older inbox pages append in stable order without marking messages read', async ({ browser }) => {
  const context = await browser.newContext()
  try {
    const suffix = Date.now().toString(36), username = `paging_${suffix}`
    await app.authenticate(context, username, 'Paging Reporter')
    if (!/^test_[a-f0-9]{32}$/.test(app.environment.DATABASE_SCHEMA ?? '')) throw new Error('Expected an isolated test schema')
    const fixture = new PostgresDatabase({ connectionString: app.environment.DATABASE_URL, schema: app.environment.DATABASE_SCHEMA })
    try {
      const account = await fixture.prepare('SELECT id FROM users WHERE username=?').get<{ id: string }>(username)
      if (!account) throw new Error('Reporter fixture missing')
      await fixture.prepare("INSERT INTO game_contexts(room_id,lifecycle,created_at,updated_at) VALUES(?,'expired',1,1)").run(`paging-${suffix}`)
      await fixture.prepare(`INSERT INTO bug_reports(submission_id,reporter_user_id,room_id,player_index,lifecycle,room_version,step_no,frame_hash,
        status,github_issue_number,github_issue_url,author_identity,created_at,updated_at)
        VALUES(?,?,?,0,'active',1,0,?,'submitted',1671020,?,'hosted',1,1)`)
        .run(`paging-${suffix}`, account.id, `paging-${suffix}`, 'a'.repeat(64), 'https://github.com/titanxxh/open-agricola/issues/1671020')
      for (let index = 1; index <= 21; index++) {
        await fixture.prepare(`INSERT INTO bug_report_feedback(submission_id,recipient_user_id,request_id,kind,report_summary,explanation,version,created_at)
          VALUES(?,?,?,'confirmed_bug',?,?,?,1000)`)
          .run(`paging-${suffix}`, account.id, `paging-request-${index}`, `Report update ${index}`, `Explanation ${index}`, index)
      }
    } finally { await fixture.close() }
    const page = await context.newPage()
    await page.goto(app.appUrl)
    await page.getByRole('button', { name: 'Inbox, 21 unread', exact: true }).click()
    const inbox = page.getByRole('dialog', { name: 'Inbox', exact: true })
    await expect(inbox.locator('.inbox-list > li')).toHaveCount(20)
    await expect(inbox.locator('.inbox-list > li').first()).toContainText('Report update 21')
    await expect(inbox.getByText('Report update 1', { exact: true })).toHaveCount(0)
    await inbox.getByRole('button', { name: 'Older messages', exact: true }).click()
    await expect(inbox.locator('.inbox-list > li')).toHaveCount(21)
    await expect(inbox.locator('.inbox-list > li').last()).toContainText('Report update 1')
    await expect(inbox.getByRole('button', { name: 'Older messages', exact: true })).toHaveCount(0)
    expect(await (await context.request.get(`${app.apiUrl}/api/v1/inbox`)).json()).toMatchObject({ unreadCount: 21 })
    await inbox.getByRole('button', { name: /Report update 1 Unread/ }).click()
    await expect(inbox.getByRole('heading', { name: 'Report update 1', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Inbox, 20 unread', exact: true })).toBeVisible()
    await inbox.getByRole('button', { name: 'Back to messages', exact: true }).click()
    await expect(inbox.locator('.inbox-list > li')).toHaveCount(21)
    await expect(inbox.locator('.inbox-list > li').last()).toContainText('Read')
    const refreshed = page.waitForResponse(response => response.url().endsWith('/api/v1/inbox') && response.ok())
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await refreshed
    await expect(inbox.locator('.inbox-list > li')).toHaveCount(21)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Inbox, 20 unread', exact: true }).click()
    await expect(inbox.locator('.inbox-list > li')).toHaveCount(21)
    await expect(inbox.getByRole('button', { name: 'Older messages', exact: true })).toHaveCount(0)

  } finally { await context.close().catch(() => {}) }
})


test('administrator requests specific details and reassesses the same report while the player keeps both messages', async ({ browser }, testInfo) => {
  test.setTimeout(120000)
  const administrator = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const reporter = await browser.newContext({ viewport: { width: 390, height: 844 } })
  try {
    const suffix = Date.now().toString(36), username = `triage_${suffix}`, issueNumber = 1672001
    await app.authenticate(administrator, 'e2e_admin', 'Triage Administrator')
    await app.authenticate(reporter, username, 'Triage Reporter')
    if (!/^test_[a-f0-9]{32}$/.test(app.environment.DATABASE_SCHEMA ?? '')) throw new Error('Expected an isolated test schema')
    const fixture = new PostgresDatabase({ connectionString: app.environment.DATABASE_URL, schema: app.environment.DATABASE_SCHEMA })
    try {
      const account = await fixture.prepare('SELECT id FROM users WHERE username=?').get<{ id: string }>(username)
      if (!account) throw new Error('Reporter fixture missing')
      await fixture.prepare("INSERT INTO game_contexts(room_id,lifecycle,created_at,updated_at) VALUES(?,'expired',1,1)").run(`triage-${suffix}`)
      await fixture.prepare(`INSERT INTO bug_reports(submission_id,reporter_user_id,room_id,player_index,lifecycle,room_version,step_no,frame_hash,
        status,github_issue_number,github_issue_url,author_identity,created_at,updated_at)
        VALUES(?,?,?,0,'active',1,0,?,'submitted',?,?,'hosted',1,1)`)
        .run(`triage-${suffix}`, account.id, `triage-${suffix}`, 'a'.repeat(64), issueNumber,
          `https://github.com/titanxxh/open-agricola/issues/${issueNumber}`)
    } finally { await fixture.close() }
    const owner = await administrator.newPage(), member = await reporter.newPage()
    const settings = new URL(app.appUrl); settings.searchParams.set('page', 'settings')
    await owner.goto(settings.href)
    const manager = owner.locator('.bug-report-feedback-settings')
    await manager.getByRole('spinbutton', { name: 'GitHub issue number', exact: true }).fill(String(issueNumber))
    await manager.getByRole('button', { name: 'Find report', exact: true }).click()
    await manager.getByRole('combobox', { name: 'Assessment', exact: true }).selectOption('needs_info')
    await manager.getByRole('textbox', { name: 'Report summary', exact: true }).fill('Page disconnected during feeding')
    await manager.getByRole('textbox', { name: 'Explanation for the reporter', exact: true }).fill('Please add these details on the original issue so we can assess the disconnect.')
    const missing = manager.getByRole('textbox', { name: 'Specific missing items (one per line)', exact: true })
    await missing.fill('More information needed.')
    await expect(manager.getByRole('button', { name: 'Send assessment and notify', exact: true })).toBeDisabled()
    await missing.fill('Action immediately before the disconnect\nBrowser and device')
    await manager.getByRole('button', { name: 'Send assessment and notify', exact: true }).focus()
    await owner.keyboard.press('Enter')
    await expect(manager.getByRole('status')).toHaveText('Feedback sent to the reporter.')
    await expect(manager.locator('.feedback-history')).toContainText('More information needed · awaiting assessment')
    expect(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await manager.screenshot({ path: testInfo.outputPath('triage-admin-mobile.png') })

    await member.goto(app.appUrl)
    await member.locator('.lobby-menu-toggle').click()
    await member.getByRole('button', { name: 'Display language: English', exact: true }).click()
    await member.getByRole('option', { name: '简体中文', exact: true }).click()
    await member.getByRole('menuitem', { name: '站内信，1 封未读', exact: true }).focus()
    await member.keyboard.press('Enter')
    const inbox = member.getByRole('dialog', { name: '站内信', exact: true })
    await inbox.getByRole('button', { name: /Page disconnected during feeding/ }).click()
    await expect(inbox.getByText('需要补充信息 · 待确认', { exact: true })).toBeVisible()
    await expect(inbox.getByRole('list')).toContainText('Action immediately before the disconnect')
    await expect(inbox.getByText('无需 GitHub 账号即可阅读公开 issue；在 GitHub 补充材料需要账号。', { exact: true })).toBeVisible()
    await expect(inbox.getByRole('link', { name: `查看 issue #${issueNumber}`, exact: true })).toHaveAttribute('href', `https://github.com/titanxxh/open-agricola/issues/${issueNumber}`)
    const popup = member.waitForEvent('popup')
    await inbox.getByRole('link', { name: `查看 issue #${issueNumber}`, exact: true }).click()
    const publicIssue = await popup
    await expect(publicIssue).toHaveURL(`https://github.com/titanxxh/open-agricola/issues/${issueNumber}`)
    await publicIssue.close()
    expect(await member.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await member.screenshot({ path: testInfo.outputPath('triage-inbox-mobile-zh.png'), fullPage: true })
    await member.keyboard.press('Escape')

    // A stale administrator must reload before replacing a newer assessment.
    const update = await administrator.request.post(`${app.apiUrl}/api/admin/bug-report-feedback`, { data: {
      issueNumber, requestId: 'triage-newer-version', expectedVersion: 1, kind: 'confirmed_bug',
      reportSummary: 'Page disconnected during feeding', explanation: 'Reassessment reproduced the socket disconnect.' } })
    expect(update.status()).toBe(200)
    await manager.getByRole('combobox', { name: 'Assessment', exact: true }).selectOption('not_bug')
    await manager.getByRole('textbox', { name: 'Explanation for the reporter', exact: true }).fill('The brief reconnect preserves the game state. A clearer reconnect indicator is an improvement suggestion.')
    await manager.getByRole('button', { name: 'Send assessment and notify', exact: true }).click()
    await expect(manager.getByRole('alert')).toContainText('This report changed. Find it again to review the latest feedback.')
    await manager.getByRole('button', { name: 'Reload latest assessment', exact: true }).click()
    await expect(manager.locator('.feedback-history > li')).toHaveCount(2)
    await manager.getByRole('combobox', { name: 'Assessment', exact: true }).selectOption('not_bug')
    await manager.getByRole('textbox', { name: 'Explanation for the reporter', exact: true }).fill('The brief reconnect preserves the game state. A clearer reconnect indicator is an improvement suggestion.')
    await manager.getByRole('button', { name: 'Send assessment and notify', exact: true }).click()
    await expect(manager.getByRole('status')).toHaveText('Feedback sent to the reporter.')
    await expect(manager.locator('.feedback-history > li')).toHaveCount(3)
    await expect(manager.locator('.feedback-history > li').last()).toContainText('Not a bug')
    await member.reload()
    await member.locator('.lobby-menu-toggle').click()
    await member.getByRole('button', { name: 'Display language: English', exact: true }).click()
    await member.getByRole('option', { name: '简体中文', exact: true }).click()
    await member.getByRole('menuitem', { name: '站内信，2 封未读', exact: true }).click()
    await expect(inbox.locator('.inbox-list > li')).toHaveCount(3)
    await expect(inbox.getByText('已读', { exact: true })).toHaveCount(1)
    await inbox.locator('.inbox-list > li').first().getByRole('button').click()
    await expect(inbox.getByText('非 bug', { exact: true })).toBeVisible()
    await expect(inbox.getByText('The brief reconnect preserves the game state. A clearer reconnect indicator is an improvement suggestion.', { exact: true })).toBeVisible()
    await member.screenshot({ path: testInfo.outputPath('triage-corrected-mobile-zh.png'), fullPage: true })
  } finally { await Promise.allSettled([administrator.close(), reporter.close()]) }
})
