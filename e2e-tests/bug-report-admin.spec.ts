// @covers server/bug-report/feedback-service.ts
// @covers server/bug-report-feedback-routes.ts
// @covers client/app/Inbox.tsx
// @covers client/app/BugReportFeedbackSettings.tsx
// @covers client/app/LobbyPage.tsx
// @covers client/app/GameContainerApi.tsx
// @covers client/app/SettingsPage.tsx
// @covers server/bug-report/github-fix-verifier.ts
// @covers client/app/BugReportFixSettings.tsx
// @covers server/bug-report/historical-feedback.ts
// @covers server/bug-report/historical-feedback-cli.ts
// @covers server/bug-report-routes.ts
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { browserRequestHeaders } from './fixtures'
import { startHostedReleaseAppWithBetaAccess } from './helpers/beta-access-app'
import { PostgresDatabase } from '../server/database/postgres'
import { BugReportFeedbackService } from '../server/bug-report/feedback-service'
import type { DeploymentProof } from '../server/bug-report/deployment-proof'
import type { HistoricalPreview } from '../server/bug-report/historical-feedback'

// One isolated application serves every bug-report administration case. It replaces only the external GitHub API
// (helpers/github-fix-fixture.mjs) and encrypts reporter tokens with a fixed isolated key.
let app: Awaited<ReturnType<typeof startHostedReleaseAppWithBetaAccess>>
test.use({ actionTimeout: 10000 })
test.beforeAll(async () => {
  test.setTimeout(180000)
  const previous = {
    NODE_OPTIONS: process.env.NODE_OPTIONS,
    BUG_REPORT_TOKEN_ENCRYPTION_KEYS: process.env.BUG_REPORT_TOKEN_ENCRYPTION_KEYS,
    BUG_REPORT_TOKEN_ACTIVE_KEY_ID: process.env.BUG_REPORT_TOKEN_ACTIVE_KEY_ID,
  }
  process.env.NODE_OPTIONS = `${previous.NODE_OPTIONS ?? ''} --import=${new URL('./helpers/github-fix-fixture.mjs', import.meta.url).pathname}`.trim()
  process.env.BUG_REPORT_TOKEN_ENCRYPTION_KEYS = JSON.stringify({ isolated: Buffer.alloc(32, 7).toString('base64') })
  process.env.BUG_REPORT_TOKEN_ACTIVE_KEY_ID = 'isolated'
  try { app = await startHostedReleaseAppWithBetaAccess() }
  finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value
    }
  }
})
test.afterAll(async () => { await app?.close() })

// The historical backfill CLI reads every report in the database, so it runs before the other cases add theirs.
test('owner preview and explicit backfill deliver historical feedback without creating native report authority', async ({ browser }, testInfo) => {
  test.setTimeout(120000)
  const reporter = await browser.newContext(), administrator = await browser.newContext(), other = await browser.newContext()
  const fixture = new PostgresDatabase({ connectionString: app.environment.DATABASE_URL, schema: app.environment.DATABASE_SCHEMA })
  try {
    const suffix = Date.now().toString(36), username = `hist_${suffix}`
    await app.authenticate(administrator, 'e2e_admin', 'Historical administrator')
    await app.authenticate(reporter, username, 'Historical reporter')
    await app.authenticate(other, `other_${suffix}`, 'Other reporter')
    const account = await fixture.prepare('SELECT id FROM users WHERE username=?').get<{ id: string }>(username)
    const admin = await fixture.prepare("SELECT id FROM users WHERE username='e2e_admin'").get<{ id: string }>()
    if (!account || !admin || !/^test_[a-f0-9]{32}$/.test(app.environment.DATABASE_SCHEMA ?? '')) throw new Error('Expected isolated accounts/database')
    const room = `history-${suffix}`, marker = '11111111-1111-4111-8111-111111111111'
    await fixture.prepare("INSERT INTO game_contexts(room_id,lifecycle,created_at,updated_at) VALUES(?,'expired',1,1)").run(room)
    for (const issue of [1464,1479,1490,1504,1564,1574,1586,1591,1595,1622,1637]) await fixture.prepare(`INSERT INTO bug_reports(submission_id,reporter_user_id,room_id,player_index,lifecycle,room_version,step_no,frame_hash,status,github_issue_number,created_at,updated_at)
      VALUES(?,?,?,0,'active',1,0,?,'submitted',?,1,1)`).run(`hist-${issue}-${suffix}`, account.id, room, 'a'.repeat(64), issue)
    const sha = 'c'.repeat(40)
    const proof: DeploymentProof = { repository: 'titanxxh/open-agricola', observedAt: 2000,
      release: { version: 'v0.30.0', url: 'https://github.com/titanxxh/open-agricola/releases/tag/v0.30.0', sha, tagSha: sha, draft: false, prerelease: false, publishedAt: 1000 },
      candidate: { status: 'passed', repository: 'titanxxh/open-agricola', sha, configuration: 'd'.repeat(64), requiredTaskIds: ['quality'], tasks: [{ id: 'quality', status: 'passed', reason: null, runId: 1, jobId: 2, url: 'https://github.com/titanxxh/open-agricola/actions/runs/1/job/2' }] },
      frontend: { format: 1, gameBuildId: sha, basePath: '/', url: 'https://example.test/frontend-build.json' }, backend: { gameBuildId: sha, running: true, ready: true, containerId: 'isolated' },
      ancestry: { format: 'git-raw-closure-v1', commits: ['a94787d1e61004fc863aaf3dbf2171bda834a716','db196efe21951429230301454cee7eef35a8d249','d1570f66cd2dac96c0f66d008684cfff12f168f5','f9edb37342f4f9deeb2ccd344d5c0b9ab9a3cebf',sha] } }
    await new BugReportFeedbackService(fixture).recordVerifiedDeployment('historical-ui-production', proof)
    const body = `- Reporter site ID: \`${account.id}\`\n- Room ID: \`${room}\`\n- Reporter seat: \`p99\`\n- Step: \`999999\`\n<!-- open-agricola-report:${marker} -->`
    const reviewed = { explanation1595: '最后一张牌仍需确认是当前交互流程的体验建议，不属于规则或结算错误；建议已保留供后续体验改进。', imports: [{ issueNumber: 1465, submissionId: marker, reporterSiteId: account.id, roomId: room, bodySha256: createHash('sha256').update(body).digest('hex'), auditReference: 'isolated-reviewed-audit' }] }
    const run = async (apply = false) => {
      const child = execFile(process.execPath, ['--import', 'tsx', 'server/bug-report/historical-feedback-cli.ts', ...(apply ? ['--execute',`--actor=${admin.id}`] : [])], {
        cwd: process.cwd(), env: { ...process.env, ...app.environment, CI: 'false', GITHUB_ACTIONS: 'false', ADMIN_USERS: 'e2e_admin',
          NODE_OPTIONS: `--import=${new URL('./helpers/historical-github-fixture.mjs', import.meta.url).pathname}`, HISTORICAL_TEST_ISSUE_BODY: body }, timeout: 60000,
      })
      child.stdin?.end(JSON.stringify(reviewed))
      const result = await new Promise<string>((resolve, reject) => { let stdout = '', stderr = ''; child.stdout?.on('data', chunk => { stdout += chunk }); child.stderr?.on('data', chunk => { stderr += chunk }); child.on('error', reject); child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr || `Historical CLI exit ${code}`))) })
      return result
    }
    const preview: HistoricalPreview = JSON.parse(await run())
    expect(preview.projectedMessages).toBe(16)
    expect(preview.rows.find(row => row.issueNumber === 1465)?.mapping?.source).toBe('import')
    expect(preview.rows.find(row => row.issueNumber === 1465)?.fix?.text).toContain('新增主动丢弃仓库物资的操作，使夜班工人等需要丢弃资源的情况能够继续。')
    expect(await fixture.prepare('SELECT 1 FROM bug_report_feedback_subjects WHERE submission_id=?').get(marker)).toBeUndefined()
    expect((await reporter.request.get(`${app.apiUrl}/api/v1/inbox`, { headers: browserRequestHeaders(app.apiUrl) })).status()).toBe(200)
    expect(await (await reporter.request.get(`${app.apiUrl}/api/v1/inbox`, { headers: browserRequestHeaders(app.apiUrl) })).json()).toMatchObject({ unreadCount: 0, messages: [] })
    expect(JSON.parse(await run(true))).toMatchObject({ newMessages: 16, errors: [] })
    expect((await reporter.request.get(`${app.apiUrl}/api/v1/bug-reports/${marker}`, { headers: browserRequestHeaders(app.apiUrl) })).status()).toBe(404)
    expect((await administrator.request.post(`${app.apiUrl}/api/v1/bug-reports/${marker}/evidence/inspect`, { headers: browserRequestHeaders(app.apiUrl), data: { perspective: 'open', reason: 'must not grant imported authority' } })).status()).toBe(404)
    expect((await reporter.request.get(`${app.apiUrl}/api/v1/game-contexts/${room}/evidence/999999?frame=${'f'.repeat(64)}`, { headers: browserRequestHeaders(app.apiUrl) })).status()).toBe(403)
    expect(await fixture.prepare('SELECT COUNT(*) AS count FROM game_replay_steps WHERE room_id=?').get(room)).toEqual({ count: 0 })
    const page = await reporter.newPage()
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(app.appUrl)
    await page.getByRole('button', { name: 'Inbox, 16 unread', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('.inbox-list > li')).toHaveCount(16)
    await dialog.screenshot({ path: testInfo.outputPath('inbox-list-desktop-en.png') })
    await dialog.locator('.inbox-list > li').filter({ hasText: '无法主动丢弃已获得资源' }).first().getByRole('button').click()
    await expect(dialog.getByRole('link', { name: 'First included in v0.11.8', exact: true })).toHaveAttribute('href', 'https://github.com/titanxxh/open-agricola/releases/tag/v0.11.8')
    await expect(dialog.getByText('新增主动丢弃仓库物资的操作，使夜班工人等需要丢弃资源的情况能够继续。', { exact: true })).toBeVisible()
    await expect(dialog.getByText('First verified in v0.30.0', { exact: true })).toBeVisible()
    await expect.poll(async () => (await (await reporter.request.get(`${app.apiUrl}/api/v1/inbox`, { headers: browserRequestHeaders(app.apiUrl) })).json()).unreadCount).toBe(15)
    expect(JSON.parse(await run(true))).toMatchObject({ newMessages: 0, errors: [] })
    expect(await (await other.request.get(`${app.apiUrl}/api/v1/inbox`, { headers: browserRequestHeaders(app.apiUrl) })).json()).toMatchObject({ unreadCount: 0, messages: [] })
    await dialog.screenshot({ path: testInfo.outputPath('historical-inbox-desktop-en.png') })
    await page.reload()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('.lobby-menu-toggle').click()
    await page.getByRole('button', { name: 'Display language: English', exact: true }).click()
    await page.getByRole('option', { name: '简体中文', exact: true }).click()
    await page.getByRole('menuitem', { name: /站内信/ }).click()
    await expect(dialog.locator('.inbox-list__unread')).toHaveCount(15)
    await dialog.screenshot({ path: testInfo.outputPath('inbox-list-mobile-zh.png') })
    await dialog.locator('.inbox-list > li').filter({ hasText: '无法主动丢弃已获得资源' }).first().getByRole('button').click()
    await expect(dialog.getByText('首次包含修复的版本：v0.11.8', { exact: false })).toBeVisible()
    await expect(dialog.getByText('新增主动丢弃仓库物资的操作，使夜班工人等需要丢弃资源的情况能够继续。', { exact: true })).toBeVisible()
    await expect(dialog.getByText('首次核验上线版本：v0.30.0', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('link', { name: '查看 issue #1465', exact: true })).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await dialog.screenshot({ path: testInfo.outputPath('historical-inbox-mobile-zh.png') })
  } finally { await fixture.close(); await Promise.allSettled([reporter.close(), administrator.close(), other.close()]) }
})

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
      headers: { ...browserRequestHeaders(app.apiUrl), Origin: 'https://untrusted.example' }, data: { issueNumber, requestId: 'untrusted-request', expectedVersion: 0,
        kind: 'confirmed_bug', reportSummary: 'Wrong origin', explanation: 'This must not be delivered.' },
    })
    expect(rejected.status()).toBe(403)
    expect(await (await reporter.request.get(`${app.apiUrl}/api/v1/inbox`, { headers: browserRequestHeaders(app.apiUrl) })).json()).toMatchObject({ messages: [], unreadCount: 0 })
    expect((await stranger.request.get(`${app.apiUrl}/api/admin/bug-report-feedback?issue=${issueNumber}`, { headers: browserRequestHeaders(app.apiUrl) })).status()).toBe(403)

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
    const message = inbox.getByRole('button', { name: 'Resources cannot be discarded', exact: true })
    await expect(message).toHaveAccessibleDescription(/^Unread /)
    await expect(message.locator('.inbox-list__unread')).toBeVisible()
    await expect(inbox.getByText('Unread', { exact: true })).toBeHidden()
    await message.click()
    await expect(inbox.getByRole('heading', { name: 'Resources cannot be discarded', exact: true })).toBeVisible()
    await expect(inbox.getByText('Bug confirmed', { exact: true })).toBeVisible()
    await expect(inbox.getByRole('link', { name: `View issue #${issueNumber}` })).toHaveAttribute('href', `https://github.com/titanxxh/open-agricola/issues/${issueNumber}`)
    await expect(inbox.locator('b')).toHaveCount(0)
    const delivered: unknown = await (await reporter.request.get(`${app.apiUrl}/api/v1/inbox`, { headers: browserRequestHeaders(app.apiUrl) })).json()
    if (!delivered || typeof delivered !== 'object' || !('messages' in delivered) || !Array.isArray(delivered.messages)
      || !delivered.messages[0] || typeof delivered.messages[0] !== 'object' || !('id' in delivered.messages[0])
      || typeof delivered.messages[0].id !== 'number') throw new Error('Expected delivered inbox message')
    expect((await stranger.request.get(`${app.apiUrl}/api/v1/inbox/${delivered.messages[0].id}`, { headers: browserRequestHeaders(app.apiUrl) })).status()).toBe(404)
    await expect.poll(async () => (await (await reporter.request.get(`${app.apiUrl}/api/v1/inbox`, { headers: browserRequestHeaders(app.apiUrl) })).json()).unreadCount).toBe(0)
    await member.screenshot({ path: testInfo.outputPath('inbox-desktop.png'), fullPage: true })
    await member.keyboard.press('Escape')
    await member.reload()
    await member.getByRole('button', { name: 'Inbox', exact: true }).click()
    await expect(message).toHaveAccessibleDescription(/^Read /)
    await expect(message.locator('.inbox-list__unread')).toHaveCount(0)
    await expect(inbox.getByText('Read', { exact: true })).toBeHidden()
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
    const chineseMessage = chineseDialog.getByRole('button', { name: 'Resources cannot be discarded', exact: true })
    await expect(chineseMessage).toHaveAccessibleDescription(/^已读 /)
    await chineseMessage.click()
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
    expect(await (await context.request.get(`${app.apiUrl}/api/v1/inbox`, { headers: browserRequestHeaders(app.apiUrl) })).json()).toMatchObject({ unreadCount: 21 })
    const oldest = inbox.getByRole('button', { name: 'Report update 1', exact: true })
    await expect(oldest).toHaveAccessibleDescription(/^Unread /)
    await oldest.scrollIntoViewIfNeeded()
    const messagePane = inbox.locator('.inbox-dialog__body')
    const listPosition = await messagePane.evaluate(pane => pane.scrollTop)
    expect(listPosition).toBeGreaterThan(0)
    await oldest.click()
    await expect(inbox.getByRole('heading', { name: 'Report update 1', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Inbox, 20 unread', exact: true })).toBeVisible()
    await inbox.getByRole('button', { name: 'Back to messages', exact: true }).click()
    await expect(inbox.locator('.inbox-list > li')).toHaveCount(21)
    await expect(oldest).toHaveAccessibleDescription(/^Read /)
    await expect(oldest.locator('.inbox-list__unread')).toHaveCount(0)
    await expect(messagePane).toHaveJSProperty('scrollTop', listPosition)
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
    const update = await administrator.request.post(`${app.apiUrl}/api/admin/bug-report-feedback`, { headers: browserRequestHeaders(app.apiUrl), data: {
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
    await expect(inbox.locator('.inbox-list__unread')).toHaveCount(2)
    await inbox.locator('.inbox-list > li').first().getByRole('button').click()
    await expect(inbox.getByText('非 bug', { exact: true })).toBeVisible()
    await expect(inbox.getByText('The brief reconnect preserves the game state. A clearer reconnect indicator is an improvement suggestion.', { exact: true })).toBeVisible()
    await member.screenshot({ path: testInfo.outputPath('triage-corrected-mobile-zh.png'), fullPage: true })
  } finally { await Promise.allSettled([administrator.close(), reporter.close()]) }
})

test('administrator links duplicates and complete merged fixes, reloads them, and players receive no release notification', async ({ browser }, testInfo) => {
  test.setTimeout(120000)
  const administrator = await browser.newContext(), reporter = await browser.newContext(), duplicate = await browser.newContext()
  try {
    const suffix = Date.now().toString(36), username = `fix_${suffix}`, otherUsername = `dup_${suffix}`
    await app.authenticate(administrator, 'e2e_admin', 'Fix Administrator')
    await app.authenticate(reporter, username, 'Fix Reporter')
    await app.authenticate(duplicate, otherUsername, 'Duplicate Reporter')
    if (!/^test_[a-f0-9]{32}$/.test(app.environment.DATABASE_SCHEMA ?? '')) throw new Error('Expected isolated schema')
    const fixture = new PostgresDatabase({ connectionString: app.environment.DATABASE_URL, schema: app.environment.DATABASE_SCHEMA })
    try {
      await fixture.prepare("INSERT INTO game_contexts(room_id,lifecycle,created_at,updated_at) VALUES(?,'expired',1,1)").run(`fix-${suffix}`)
      for (const [issue, name] of [[1673001, username], [1673002, otherUsername]] satisfies Array<[number, string]>) {
        const account = await fixture.prepare('SELECT id FROM users WHERE username=?').get<{ id: string }>(name)
        if (!account) throw new Error('Missing reporter')
        await fixture.prepare(`INSERT INTO bug_reports(submission_id,reporter_user_id,room_id,player_index,lifecycle,room_version,step_no,frame_hash,
          status,github_issue_number,created_at,updated_at) VALUES(?,?,?,0,'active',1,0,?,'submitted',?,1,1)`)
          .run(`fix-${issue}-${suffix}`, account.id, `fix-${suffix}`, 'a'.repeat(64), issue)
      }
    } finally { await fixture.close() }
    for (const issueNumber of [1673001, 1673002]) {
      const response = await administrator.request.post(`${app.apiUrl}/api/admin/bug-report-feedback`, { headers: browserRequestHeaders(app.apiUrl), data: {
        issueNumber, requestId: `confirm-${issueNumber}`, expectedVersion: 0, kind: 'confirmed_bug',
        reportSummary: `Discard report ${issueNumber}`, explanation: 'The missing discard action is confirmed.',
      } })
      expect(response.status()).toBe(200)
    }
    const forged = await reporter.request.post(`${app.apiUrl}/api/admin/bug-report-feedback/fix`, { headers: browserRequestHeaders(app.apiUrl), data: {
      issueNumber: 1673001, requestId: 'forged-fix-request', expectedVersion: 0, purpose: 'fix', fixSummary: 'Adds an explicit discard action for supply goods without advancing the current turn.',
      pullRequests: [{ number: 1500, requiredCommits: ['a'.repeat(40), 'b'.repeat(40)] }],
    } })
    expect(forged.status()).toBe(403)
    expect((await reporter.request.post(`${app.apiUrl}/api/admin/bug-report-feedback/duplicate`, { headers: browserRequestHeaders(app.apiUrl), data: {
      issueNumber: 1673002, rootIssueNumber: 1673001, requestId: 'forged-duplicate', expectedVersion: 0,
    } })).status()).toBe(403)
    expect((await administrator.request.post(`${app.apiUrl}/api/admin/bug-report-feedback/fix`, { headers: { ...browserRequestHeaders(app.apiUrl), Origin: 'https://untrusted.example' }, data: {
      issueNumber: 1673001, requestId: 'cross-origin-fix', expectedVersion: 0, purpose: 'fix', fixSummary: 'Adds an explicit discard action for supply goods without advancing the current turn.', pullRequests: [{ number: 1500, requiredCommits: ['a'.repeat(40)] }],
    } })).status()).toBe(403)
    const owner = await administrator.newPage()
    const settings = new URL(app.appUrl); settings.searchParams.set('page', 'settings')
    await owner.goto(settings.href)
    const manager = owner.locator('.bug-report-feedback-settings')
    const find = async (issue: number) => {
      await manager.getByRole('spinbutton', { name: 'GitHub issue number', exact: true }).fill(String(issue))
      await manager.getByRole('button', { name: 'Find report', exact: true }).click()
      await expect(manager.getByRole('heading', { name: 'Fix and duplicate reports', exact: true })).toBeVisible()
    }
    await find(1673002)
    await manager.getByRole('spinbutton', { name: 'Duplicate of root issue number', exact: true }).fill('1673001')
    await manager.getByRole('button', { name: 'Link duplicate report', exact: true }).click()
    await expect(manager.getByRole('status')).toContainText('Duplicate linked. The system checks retained production evidence for release notifications.')
    await find(1673001)
    await manager.getByRole('spinbutton', { name: 'Fix PR number', exact: true }).fill('1500')
    await manager.getByRole('textbox', { name: 'Actual merged commit SHAs', exact: true }).fill(`${'a'.repeat(40)}\n${'b'.repeat(40)}`)
    await expect(manager.getByRole('button', { name: 'Verify and save fix', exact: true })).toBeDisabled()
    await manager.getByRole('textbox', { name: 'Fix summary', exact: true }).fill('Adds an explicit discard action for supply goods without advancing the current turn.')
    await manager.getByRole('button', { name: 'Verify and save fix', exact: true }).click()
    await expect(manager.getByRole('status')).toContainText('Fix association saved. The system checks retained production evidence for release notifications.')
    await expect(manager.getByText('Fix linked, awaiting verified production release.', { exact: true })).toBeVisible()
    expect((await administrator.request.post(`${app.apiUrl}/api/admin/bug-report-feedback/fix`, { headers: browserRequestHeaders(app.apiUrl), data: {
      issueNumber: 1673001, requestId: 'stale-version-fix', expectedVersion: 0, purpose: 'fix', fixSummary: 'Adds an explicit discard action for supply goods without advancing the current turn.',
      pullRequests: [{ number: 1500, requiredCommits: ['a'.repeat(40), 'b'.repeat(40)] }],
    } })).status()).toBe(409)
    await owner.reload()
    await find(1673002)
    await expect(manager.locator('.fix-association')).toContainText('Root issue #1673001 · Fix revision 1')
    await expect(manager.locator('.fix-association')).toContainText('a'.repeat(40))
    await expect(manager.locator('.fix-association')).toContainText('b'.repeat(40))
    await expect(manager.locator('.fix-association').getByRole('link', { name: '#1673001', exact: true })).toBeVisible()
    await owner.setViewportSize({ width: 390, height: 844 })
    expect(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await owner.getByRole('button', { name: 'Display language: English', exact: true }).click()
    await owner.getByRole('option', { name: '简体中文', exact: true }).click()
    await expect(manager.getByRole('heading', { name: '修复与重复报告', exact: true })).toBeVisible()
    await expect(manager.getByText('已关联修复，等待核验生产上线。', { exact: true })).toBeVisible()
    await manager.screenshot({ path: testInfo.outputPath('fix-duplicate-mobile-zh.png') })
    for (const context of [reporter, duplicate]) {
      const inbox = await (await context.request.get(`${app.apiUrl}/api/v1/inbox`, { headers: browserRequestHeaders(app.apiUrl) })).json()
      expect(inbox.messages).toHaveLength(1)
      expect(inbox.messages[0].kind).toBe('confirmed_bug')
      const page = await context.newPage()
      await page.goto(app.appUrl)
      await page.getByRole('button', { name: 'Inbox, 1 unread', exact: true }).click()
      await expect(page.getByRole('dialog').locator('.inbox-list > li')).toHaveCount(1)
      await expect(page.getByRole('dialog')).not.toContainText('released')
    }
  } finally { await Promise.allSettled([administrator.close(), reporter.close(), duplicate.close()]) }
})

test('administrator drafts retain their own CAS versions across triage refreshes and recover a lost save response', async ({ browser }) => {
  test.setTimeout(120000)
  const administratorA = await browser.newContext(), administratorB = await browser.newContext()
  const fixture = new PostgresDatabase({ connectionString:app.environment.DATABASE_URL,schema:app.environment.DATABASE_SCHEMA })
  try {
    await app.authenticate(administratorA,'e2e_admin','Administrator A')
    await app.authenticate(administratorB,'e2e_admin','Administrator B')
    const account = await fixture.prepare("SELECT id FROM users WHERE username='e2e_admin'").get<{ id:string }>()
    if (!account || !/^test_[a-f0-9]{32}$/.test(app.environment.DATABASE_SCHEMA ?? '')) throw new Error('Expected isolated administrator')
    const room = `draft-${Date.now()}`, issue = 1673011, source = 1673012, alternative = 1673013
    const first = 'Adds a discard selector while keeping the current turn.'
    const second = 'Adds a discard selector with explicit quantities and preserves action availability.'
    await fixture.prepare("INSERT INTO game_contexts(room_id,lifecycle,created_at,updated_at) VALUES(?,'expired',1,1)").run(room)
    for (const number of [issue,source,alternative]) {
      await fixture.prepare(`INSERT INTO bug_reports(submission_id,reporter_user_id,room_id,player_index,lifecycle,room_version,step_no,frame_hash,status,github_issue_number,created_at,updated_at)
        VALUES(?,?,?,0,'active',1,0,?,'submitted',?,1,1)`).run(`${room}-${number}`,account.id,room,'a'.repeat(64),number)
      expect((await administratorB.request.post(`${app.apiUrl}/api/admin/bug-report-feedback`,{ headers: browserRequestHeaders(app.apiUrl), data:{ issueNumber:number,requestId:`draft-confirm-${number}`,expectedVersion:0,kind:'confirmed_bug',reportSummary:'Discard observation',explanation:'The missing discard action is confirmed.' } })).status()).toBe(200)
    }
    const updateFix = async (requestId:string,expectedVersion:number,fixSummary:string,requiredCommits:string[]) => administratorB.request.post(`${app.apiUrl}/api/admin/bug-report-feedback/fix`,{ headers: browserRequestHeaders(app.apiUrl), data:{ issueNumber:issue,requestId,expectedVersion,purpose:'fix',fixSummary,pullRequests:[{ number:1500,requiredCommits }] } })
    const view = async (number = issue) => (await (await administratorB.request.get(`${app.apiUrl}/api/admin/bug-report-feedback?issue=${number}`, { headers: browserRequestHeaders(app.apiUrl) })).json()).report
    expect((await updateFix('draft-initial-fix',0,first,['a'.repeat(40),'b'.repeat(40)])).status()).toBe(200)
    const owner = await administratorA.newPage()
    const settings = new URL(app.appUrl); settings.searchParams.set('page','settings')
    await owner.goto(settings.href)
    const manager = owner.locator('.bug-report-feedback-settings'), panel = manager.locator('.fix-association')
    const find = async (number:number) => {
      await manager.getByRole('spinbutton',{ name:'GitHub issue number',exact:true }).fill(String(number))
      await manager.getByRole('button',{ name:'Find report',exact:true }).click()
      await expect(panel.getByRole('heading',{ name:'Fix and duplicate reports',exact:true })).toBeVisible()
    }
    const triage = async (text:string) => {
      await manager.getByRole('textbox',{ name:'Explanation for the reporter',exact:true }).fill(text)
      await manager.getByRole('button',{ name:'Confirm bug and notify',exact:true }).click()
      await expect(manager.locator('.settings-success').filter({ hasText:'Feedback sent to the reporter.' })).toBeVisible()
    }
    const save = panel.getByRole('button',{ name:'Verify and save fix',exact:true })
    const summary = panel.getByRole('textbox',{ name:'Fix summary',exact:true })
    const commits = panel.getByRole('textbox',{ name:'Actual merged commit SHAs',exact:true })
    await find(issue)
    await expect(summary).toHaveValue(first)
    expect((await updateFix('draft-concurrent-fix',1,second,['b'.repeat(40)])).status()).toBe(200)
    await triage('The report remains confirmed after reviewing another observation.')
    await save.click()
    await expect(panel.getByRole('alert')).toHaveText('This association changed. Find the report again before saving.')
    expect((await view()).fix).toMatchObject({ version:2,fixSummary:second,pullRequests:[{ requiredCommits:['b'.repeat(40)] }] })
    await find(issue)
    await expect(summary).toHaveValue(second)
    await expect(commits).toHaveValue('b'.repeat(40))
    await summary.fill('Adds quantity selection and keeps all remaining actions available.')
    await save.click()
    await expect(panel.getByRole('status')).toContainText('Fix association saved.')
    await summary.fill('Adds quantity selection, validates supply counts and preserves the active turn.')
    await save.click()
    await expect(panel.getByRole('status')).toContainText('Fix association saved.')
    expect((await view()).fix.version).toBe(4)

    const lostSummary = 'Adds a supply-goods selector and keeps the remaining action choices available.'
    const latestSummary = 'Adds explicit quantities, validates supply goods and preserves every remaining action.'
    const attempts:Array<{ requestId:string; expectedVersion:number }> = []
    await owner.route('**/api/admin/bug-report-feedback/fix',async route => {
      const input:unknown = route.request().postDataJSON()
      if (!input || typeof input !== 'object' || !('requestId' in input) || typeof input.requestId !== 'string' || !('expectedVersion' in input) || typeof input.expectedVersion !== 'number') throw new Error('Invalid actual fix request')
      attempts.push({ requestId:input.requestId,expectedVersion:input.expectedVersion })
      if (attempts.length === 1) {
        expect((await route.fetch()).status()).toBe(200)
        expect((await updateFix('draft-after-lost-save',5,latestSummary,['a'.repeat(40),'b'.repeat(40)])).status()).toBe(200)
        await route.abort('failed')
      } else await route.continue()
    })
    await summary.fill(lostSummary)
    await save.click()
    await expect(panel.getByRole('alert')).toBeVisible()
    expect((await view()).fix).toMatchObject({ version:6,fixSummary:latestSummary })
    await save.click()
    await expect(panel.getByRole('status')).toContainText('Fix association saved.')
    expect(attempts).toHaveLength(2)
    expect(attempts[0].expectedVersion).toBe(4)
    expect(attempts[1]).toEqual(attempts[0])
    await expect(summary).toHaveValue(latestSummary)
    await expect(commits).toHaveValue(`${'a'.repeat(40)}\n${'b'.repeat(40)}`)
    expect((await view()).fix.version).toBe(6)
    await summary.fill('Adds explicit goods and quantity selection while preserving the current action flow.')
    await save.click()
    await expect(panel.getByRole('status')).toContainText('Fix association saved.')
    expect((await view()).fix.version).toBe(7)

    await find(source)
    await panel.getByRole('spinbutton',{ name:'Duplicate of root issue number',exact:true }).fill(String(alternative))
    expect((await administratorB.request.post(`${app.apiUrl}/api/admin/bug-report-feedback/duplicate`,{ headers: browserRequestHeaders(app.apiUrl), data:{ issueNumber:source,rootIssueNumber:issue,requestId:'draft-concurrent-duplicate',expectedVersion:0 } })).status()).toBe(200)
    await triage('This independent report remains confirmed while a duplicate association changes.')
    const duplicateSave = panel.getByRole('button',{ name:'Link duplicate report',exact:true })
    await duplicateSave.click()
    await expect(panel.getByRole('alert')).toHaveText('This association changed. Find the report again before saving.')
    expect((await view(source)).fix).toMatchObject({ rootIssueNumber:issue,associationVersion:1 })
    await find(source)
    await panel.getByRole('spinbutton',{ name:'Duplicate of root issue number',exact:true }).fill(String(alternative))
    await duplicateSave.click()
    await expect(panel.getByRole('status')).toContainText('Duplicate linked.')
    await panel.getByRole('spinbutton',{ name:'Duplicate of root issue number',exact:true }).fill(String(issue))
    await duplicateSave.click()
    await expect(panel.getByRole('status')).toContainText('Duplicate linked.')
    expect((await view(source)).fix).toMatchObject({ rootIssueNumber:issue,associationVersion:3 })
  } finally { await fixture.close(); await Promise.allSettled([administratorA.close(),administratorB.close()]) }
})

test('players read the verified release, original and late related reports without duplicate sends or read-state changes', async ({ browser }, testInfo) => {
  test.setTimeout(120000)
  const administrator = await browser.newContext(), reporter = await browser.newContext()
  try {
    const suffix = Date.now().toString(36), username = `live_${suffix}`
    await app.authenticate(administrator, 'e2e_admin', 'Release Administrator')
    await app.authenticate(reporter, username, 'Release Reporter')
    if (!/^test_[a-f0-9]{32}$/.test(app.environment.DATABASE_SCHEMA ?? '')) throw new Error('Expected isolated schema')
    const fixture = new PostgresDatabase({ connectionString: app.environment.DATABASE_URL, schema: app.environment.DATABASE_SCHEMA })
    const issueNumber = 1674001, duplicate = 1674002
    const sha = 'c'.repeat(40), version = 'v0.20.0'
    const proof: DeploymentProof = { repository: 'titanxxh/open-agricola', observedAt: 2000,
      release: { version, url: `https://github.com/titanxxh/open-agricola/releases/tag/${version}`, sha, tagSha: sha, draft: false, prerelease: false, publishedAt: 1000 },
      candidate: { status: 'passed', repository: 'titanxxh/open-agricola', sha, configuration: 'd'.repeat(64), requiredTaskIds: ['quality', 'fast', 'slow', 'build', 'chromium-1', 'chromium-2', 'chromium-3', 'chromium-4', 'browser-sandbox', 'webkit'],
        tasks: ['quality', 'fast', 'slow', 'build', 'chromium-1', 'chromium-2', 'chromium-3', 'chromium-4', 'browser-sandbox', 'webkit'].map((id, index) => ({
          id, status: 'passed', reason: null, runId: 1234, jobId: 4321 + index, url: `https://github.com/titanxxh/open-agricola/actions/runs/1234/job/${4321 + index}`,
        })) },
      frontend: { format: 1, gameBuildId: sha, basePath: '/open-agricola/', url: 'https://example.test/open-agricola/frontend-build.json' },
      backend: { gameBuildId: sha, running: true, ready: true, containerId: 'test-container' },
      ancestry: { format: 'git-raw-closure-v1', commits: ['a'.repeat(40), 'b'.repeat(40), sha] } }
    try {
      const account = await fixture.prepare('SELECT id FROM users WHERE username=?').get<{ id: string }>(username)
      if (!account) throw new Error('Missing reporter')
      await fixture.prepare("INSERT INTO game_contexts(room_id,lifecycle,created_at,updated_at) VALUES(?,'expired',1,1)").run(`release-${suffix}`)
      for (const issue of [issueNumber, duplicate]) await fixture.prepare(`INSERT INTO bug_reports(submission_id,reporter_user_id,room_id,player_index,lifecycle,room_version,step_no,frame_hash,
        status,github_issue_number,created_at,updated_at) VALUES(?,?,?,0,'active',1,0,?,'submitted',?,1,1)`)
        .run(`release-${issue}-${suffix}`, account.id, `release-${suffix}`, 'a'.repeat(64), issue)
      for (const issue of [issueNumber, duplicate]) expect((await administrator.request.post(`${app.apiUrl}/api/admin/bug-report-feedback`, { headers: browserRequestHeaders(app.apiUrl), data: {
        issueNumber: issue, requestId: `confirm-${issue}`, expectedVersion: 0, kind: 'confirmed_bug', reportSummary: `Discard report ${issue}`,
        explanation: 'The missing discard action is confirmed.',
      } })).status()).toBe(200)
      expect((await administrator.request.post(`${app.apiUrl}/api/admin/bug-report-feedback/fix`, { headers: browserRequestHeaders(app.apiUrl), data: {
        issueNumber, requestId: 'release-fix-request', expectedVersion: 0, purpose: 'fix', fixSummary: 'Adds an explicit <discard> action for supply goods without advancing the current turn.', pullRequests: [{ number: 1500, requiredCommits: ['a'.repeat(40)] }],
      } })).status()).toBe(200)
      expect((await new BugReportFeedbackService(fixture).recordVerifiedDeployment('ui-deployment-01', proof)).status).toBe('completed')
      expect((await administrator.request.post(`${app.apiUrl}/api/admin/bug-report-feedback/release`, { headers: browserRequestHeaders(app.apiUrl), data: { operationId: 'forged-proof', proof } })).status()).toBe(404)
      const page = await reporter.newPage()
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.goto(app.appUrl)
      await page.getByRole('button', { name: 'Inbox, 3 unread', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.locator('.inbox-list > li')).toHaveCount(3)
      await dialog.locator('.inbox-list > li').filter({ hasText: `Discard report ${issueNumber}` }).first().getByRole('button').click()
      await expect(dialog.getByText('Fix is live', { exact: true })).toBeVisible()
      await expect(dialog.getByText('Adds an explicit <discard> action for supply goods without advancing the current turn.', { exact: true })).toBeVisible()
      const releaseLink = dialog.getByRole('link', { name: 'First verified in v0.20.0', exact: true })
      await expect(releaseLink).toHaveAttribute('href', 'https://github.com/titanxxh/open-agricola/releases/tag/v0.20.0')
      await expect(dialog.getByRole('link', { name: `View issue #${issueNumber}`, exact: true })).toHaveCount(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await expect.poll(async () => {
        const inbox = await (await reporter.request.get(`${app.apiUrl}/api/v1/inbox`, { headers: browserRequestHeaders(app.apiUrl) })).json()
        return inbox.messages.find((entry: { kind: string }) => entry.kind === 'fix_released')?.readAt ?? null
      }).not.toBeNull()
      const before = await (await reporter.request.get(`${app.apiUrl}/api/v1/inbox`, { headers: browserRequestHeaders(app.apiUrl) })).json()
      const original = before.messages.find((entry: { kind: string }) => entry.kind === 'fix_released')
      expect(original.readAt).not.toBeNull()
      expect((await administrator.request.post(`${app.apiUrl}/api/admin/bug-report-feedback/duplicate`, { headers: browserRequestHeaders(app.apiUrl), data: {
        issueNumber: duplicate, rootIssueNumber: issueNumber, requestId: 'late-ui-duplicate', expectedVersion: 0,
      } })).status()).toBe(200)
      await new BugReportFeedbackService(fixture).recordVerifiedDeployment('ui-deployment-01', proof)
      const after = await (await reporter.request.get(`${app.apiUrl}/api/v1/inbox`, { headers: browserRequestHeaders(app.apiUrl) })).json()
      expect(after.messages.filter((entry: { kind: string }) => entry.kind === 'fix_released')).toHaveLength(1)
      expect(after.messages.find((entry: { id: number }) => entry.id === original.id)).toMatchObject({ readAt: original.readAt, release: original.release,
        relatedReports: [{ issueNumber }, { issueNumber: duplicate }] })
      const newerSha = 'e'.repeat(40)
      const newer: DeploymentProof = { ...proof, observedAt: 2500,
        release: { ...proof.release, version: 'v0.21.0', url: 'https://github.com/titanxxh/open-agricola/releases/tag/v0.21.0', sha: newerSha, tagSha: newerSha, publishedAt: 2400 },
        candidate: { ...proof.candidate, sha: newerSha }, frontend: { ...proof.frontend, gameBuildId: newerSha },
        backend: { ...proof.backend, gameBuildId: newerSha }, ancestry: { ...proof.ancestry, commits: [...proof.ancestry.commits, newerSha] } }
      expect((await new BugReportFeedbackService(fixture).recordVerifiedDeployment('ui-later-deployment', newer)).status).toBe('completed')
      await page.reload()
      await page.setViewportSize({ width: 390, height: 844 })
      await page.locator('.lobby-menu-toggle').click()
      await page.getByRole('button', { name: 'Display language: English', exact: true }).click()
      await page.getByRole('option', { name: '简体中文', exact: true }).click()
      await page.getByRole('menuitem', { name: /站内信/ }).click()
      await dialog.locator('.inbox-list > li').filter({ hasText: `Discard report ${issueNumber}` }).first().getByRole('button').click()
      await expect(dialog.getByText('修复已上线', { exact: true })).toBeVisible()
      await expect(dialog.getByText('Adds an explicit <discard> action for supply goods without advancing the current turn.', { exact: true })).toBeVisible()
      await expect(dialog.getByRole('heading', { name: '相关报告', exact: true })).toBeVisible()
      await expect(dialog.getByRole('link', { name: `查看 issue #${duplicate}`, exact: true })).toBeVisible()
      await expect(dialog.getByText('首次核验上线版本：v0.20.0', { exact: true })).toBeVisible()
      await expect(dialog.getByRole('link', { name: '核验时的生产版本：v0.21.0', exact: true })).toHaveAttribute('href', 'https://github.com/titanxxh/open-agricola/releases/tag/v0.21.0')
      await dialog.screenshot({ path: testInfo.outputPath('release-inbox-mobile-zh.png') })
      const owner = await administrator.newPage()
      const settings = new URL(app.appUrl); settings.searchParams.set('page', 'settings')
      await owner.goto(settings.href)
      const manager = owner.locator('.bug-report-feedback-settings')
      await manager.getByRole('spinbutton', { name: 'GitHub issue number', exact: true }).fill(String(issueNumber))
      await manager.getByRole('button', { name: 'Find report', exact: true }).click()
      await expect(manager.getByText('Fix verified in production', { exact: true })).toBeVisible()
      await expect(manager.getByRole('link', { name: 'View release v0.20.0', exact: true })).toBeVisible()
      await expect(manager.getByRole('link', { name: 'View release v0.21.0', exact: true })).toBeVisible()
    } finally { await fixture.close() }
  } finally { await Promise.allSettled([administrator.close(), reporter.close()]) }
})
