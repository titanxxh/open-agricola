// @covers server/bug-report/feedback-service.ts
// @covers server/bug-report/github-fix-verifier.ts
// @covers server/bug-report-feedback-routes.ts
// @covers client/app/BugReportFixSettings.tsx
import { expect, test } from '@playwright/test'
import { startHostedReleaseAppWithExperimentalFeatures } from './helpers/experimental-features-app'
import { PostgresDatabase } from '../server/database/postgres'

let app: Awaited<ReturnType<typeof startHostedReleaseAppWithExperimentalFeatures>>
test.use({ actionTimeout: 10000 })
test.beforeAll(async () => {
  test.setTimeout(180000)
  const previous = process.env.NODE_OPTIONS
  process.env.NODE_OPTIONS = `${previous ?? ''} --import=${new URL('./helpers/github-fix-fixture.mjs', import.meta.url).pathname}`.trim()
  try { app = await startHostedReleaseAppWithExperimentalFeatures() }
  finally { if (previous === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = previous }
})
test.afterAll(async () => { await app?.close() })

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
      const response = await administrator.request.post(`${app.apiUrl}/api/admin/bug-report-feedback`, { data: {
        issueNumber, requestId: `confirm-${issueNumber}`, expectedVersion: 0, kind: 'confirmed_bug',
        reportSummary: `Discard report ${issueNumber}`, explanation: 'The missing discard action is confirmed.',
      } })
      expect(response.status()).toBe(200)
    }
    const forged = await reporter.request.post(`${app.apiUrl}/api/admin/bug-report-feedback/fix`, { data: {
      issueNumber: 1673001, requestId: 'forged-fix-request', expectedVersion: 0, purpose: 'fix',
      pullRequests: [{ number: 1500, requiredCommits: ['a'.repeat(40), 'b'.repeat(40)] }],
    } })
    expect(forged.status()).toBe(403)
    expect((await reporter.request.post(`${app.apiUrl}/api/admin/bug-report-feedback/duplicate`, { data: {
      issueNumber: 1673002, rootIssueNumber: 1673001, requestId: 'forged-duplicate', expectedVersion: 0,
    } })).status()).toBe(403)
    expect((await administrator.request.post(`${app.apiUrl}/api/admin/bug-report-feedback/fix`, { headers: { Origin: 'https://untrusted.example' }, data: {
      issueNumber: 1673001, requestId: 'cross-origin-fix', expectedVersion: 0, purpose: 'fix', pullRequests: [{ number: 1500, requiredCommits: ['a'.repeat(40)] }],
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
    await manager.getByRole('button', { name: 'Verify and save fix', exact: true }).click()
    await expect(manager.getByRole('status')).toContainText('Fix association saved. The system checks retained production evidence for release notifications.')
    await expect(manager.getByText('Fix linked, awaiting verified production release.', { exact: true })).toBeVisible()
    expect((await administrator.request.post(`${app.apiUrl}/api/admin/bug-report-feedback/fix`, { data: {
      issueNumber: 1673001, requestId: 'stale-version-fix', expectedVersion: 0, purpose: 'fix',
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
      const inbox = await (await context.request.get(`${app.apiUrl}/api/v1/inbox`)).json()
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
