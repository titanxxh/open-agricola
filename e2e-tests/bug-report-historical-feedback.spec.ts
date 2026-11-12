// @covers server/bug-report/historical-feedback.ts
// @covers server/bug-report/historical-feedback-cli.ts
// @covers server/bug-report/feedback-service.ts
// @covers server/bug-report-routes.ts
// @covers client/app/Inbox.tsx
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { startHostedReleaseAppWithBetaAccess } from './helpers/beta-access-app'
import { PostgresDatabase } from '../server/database/postgres'
import { BugReportFeedbackService } from '../server/bug-report/feedback-service'
import type { DeploymentProof } from '../server/bug-report/deployment-proof'
import type { HistoricalPreview } from '../server/bug-report/historical-feedback'

let app: Awaited<ReturnType<typeof startHostedReleaseAppWithBetaAccess>>
test.beforeAll(async () => {
  test.setTimeout(180000)
  const previousKeys = process.env.BUG_REPORT_TOKEN_ENCRYPTION_KEYS, previousActive = process.env.BUG_REPORT_TOKEN_ACTIVE_KEY_ID
  process.env.BUG_REPORT_TOKEN_ENCRYPTION_KEYS = JSON.stringify({ isolated: Buffer.alloc(32, 7).toString('base64') })
  process.env.BUG_REPORT_TOKEN_ACTIVE_KEY_ID = 'isolated'
  try { app = await startHostedReleaseAppWithBetaAccess() }
  finally {
    if (previousKeys === undefined) delete process.env.BUG_REPORT_TOKEN_ENCRYPTION_KEYS; else process.env.BUG_REPORT_TOKEN_ENCRYPTION_KEYS = previousKeys
    if (previousActive === undefined) delete process.env.BUG_REPORT_TOKEN_ACTIVE_KEY_ID; else process.env.BUG_REPORT_TOKEN_ACTIVE_KEY_ID = previousActive
  }
})
test.afterAll(async () => { await app?.close() })
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
    expect((await reporter.request.get(`${app.apiUrl}/api/v1/inbox`)).status()).toBe(200)
    expect(await (await reporter.request.get(`${app.apiUrl}/api/v1/inbox`)).json()).toMatchObject({ unreadCount: 0, messages: [] })
    expect(JSON.parse(await run(true))).toMatchObject({ newMessages: 16, errors: [] })
    expect((await reporter.request.get(`${app.apiUrl}/api/v1/bug-reports/${marker}`)).status()).toBe(404)
    expect((await administrator.request.post(`${app.apiUrl}/api/v1/bug-reports/${marker}/evidence/inspect`, { data: { perspective: 'open', reason: 'must not grant imported authority' } })).status()).toBe(404)
    expect((await reporter.request.get(`${app.apiUrl}/api/v1/game-contexts/${room}/evidence/999999?frame=${'f'.repeat(64)}`)).status()).toBe(403)
    expect(await fixture.prepare('SELECT COUNT(*) AS count FROM game_replay_steps WHERE room_id=?').get(room)).toEqual({ count: 0 })
    const page = await reporter.newPage()
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(app.appUrl)
    await page.getByRole('button', { name: 'Inbox, 16 unread', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('.inbox-list > li')).toHaveCount(16)
    await dialog.locator('.inbox-list > li').filter({ hasText: '无法主动丢弃已获得资源' }).first().getByRole('button').click()
    await expect(dialog.getByText('First included in v0.11.8', { exact: false })).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Fix summary', exact: true })).toBeVisible()
    await expect(dialog.getByText('新增主动丢弃仓库物资的操作，使夜班工人等需要丢弃资源的情况能够继续。', { exact: true })).toBeVisible()
    await expect(dialog.getByText('First verified in v0.30.0', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('link', { name: 'View release v0.11.8', exact: true })).toHaveAttribute('href', 'https://github.com/titanxxh/open-agricola/releases/tag/v0.11.8')
    await expect.poll(async () => (await (await reporter.request.get(`${app.apiUrl}/api/v1/inbox`)).json()).unreadCount).toBe(15)
    expect(JSON.parse(await run(true))).toMatchObject({ newMessages: 0, errors: [] })
    expect(await (await other.request.get(`${app.apiUrl}/api/v1/inbox`)).json()).toMatchObject({ unreadCount: 0, messages: [] })
    await dialog.screenshot({ path: testInfo.outputPath('historical-inbox-desktop-en.png') })
    await page.reload()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('.lobby-menu-toggle').click()
    await page.getByRole('button', { name: 'Display language: English', exact: true }).click()
    await page.getByRole('option', { name: '简体中文', exact: true }).click()
    await page.getByRole('menuitem', { name: /站内信/ }).click()
    await dialog.locator('.inbox-list > li').filter({ hasText: '无法主动丢弃已获得资源' }).first().getByRole('button').click()
    await expect(dialog.getByText('首次包含修复的版本：v0.11.8', { exact: false })).toBeVisible()
    await expect(dialog.getByRole('heading', { name: '修复摘要', exact: true })).toBeVisible()
    await expect(dialog.getByText('新增主动丢弃仓库物资的操作，使夜班工人等需要丢弃资源的情况能够继续。', { exact: true })).toBeVisible()
    await expect(dialog.getByText('首次核验上线版本：v0.30.0', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await dialog.screenshot({ path: testInfo.outputPath('historical-inbox-mobile-zh.png') })
  } finally { await fixture.close(); await Promise.allSettled([reporter.close(), administrator.close(), other.close()]) }
})
