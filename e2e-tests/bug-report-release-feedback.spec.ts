// @covers server/bug-report/feedback-service.ts
// @covers server/bug-report-feedback-routes.ts
// @covers client/app/Inbox.tsx
// @covers client/app/BugReportFixSettings.tsx
import { expect, test } from '@playwright/test'
import { startHostedReleaseAppWithBetaAccess } from './helpers/beta-access-app'
import { PostgresDatabase } from '../server/database/postgres'
import { BugReportFeedbackService } from '../server/bug-report/feedback-service'
import type { DeploymentProof } from '../server/bug-report/deployment-proof'

let app: Awaited<ReturnType<typeof startHostedReleaseAppWithBetaAccess>>
test.use({ actionTimeout: 10000 })
test.beforeAll(async () => {
  test.setTimeout(180000)
  const previous = process.env.NODE_OPTIONS
  process.env.NODE_OPTIONS = `${previous ?? ''} --import=${new URL('./helpers/github-fix-fixture.mjs', import.meta.url).pathname}`.trim()
  try { app = await startHostedReleaseAppWithBetaAccess() }
  finally { if (previous === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = previous }
})
test.afterAll(async () => { await app?.close() })

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
      for (const issue of [issueNumber, duplicate]) expect((await administrator.request.post(`${app.apiUrl}/api/admin/bug-report-feedback`, { data: {
        issueNumber: issue, requestId: `confirm-${issue}`, expectedVersion: 0, kind: 'confirmed_bug', reportSummary: `Discard report ${issue}`,
        explanation: 'The missing discard action is confirmed.',
      } })).status()).toBe(200)
      expect((await administrator.request.post(`${app.apiUrl}/api/admin/bug-report-feedback/fix`, { data: {
        issueNumber, requestId: 'release-fix-request', expectedVersion: 0, purpose: 'fix', fixSummary: 'Adds an explicit <discard> action for supply goods without advancing the current turn.', pullRequests: [{ number: 1500, requiredCommits: ['a'.repeat(40)] }],
      } })).status()).toBe(200)
      expect((await new BugReportFeedbackService(fixture).recordVerifiedDeployment('ui-deployment-01', proof)).status).toBe('completed')
      expect((await administrator.request.post(`${app.apiUrl}/api/admin/bug-report-feedback/release`, { data: { operationId: 'forged-proof', proof } })).status()).toBe(404)
      const page = await reporter.newPage()
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.goto(app.appUrl)
      await page.getByRole('button', { name: 'Inbox, 3 unread', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.locator('.inbox-list > li')).toHaveCount(3)
      await dialog.locator('.inbox-list > li').filter({ hasText: `Discard report ${issueNumber}` }).first().getByRole('button').click()
      await expect(dialog.getByText('Fix is live', { exact: true })).toBeVisible()
      await expect(dialog.getByRole('heading', { name: 'Fix summary', exact: true })).toBeVisible()
      await expect(dialog.getByText('Adds an explicit <discard> action for supply goods without advancing the current turn.', { exact: true })).toBeVisible()
      const releaseLink = dialog.getByRole('link', { name: 'View release v0.20.0', exact: true }).first()
      await expect(releaseLink).toHaveAttribute('href', 'https://github.com/titanxxh/open-agricola/releases/tag/v0.20.0')
      await expect(dialog.getByRole('heading', { name: 'Related reports', exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await expect.poll(async () => {
        const inbox = await (await reporter.request.get(`${app.apiUrl}/api/v1/inbox`)).json()
        return inbox.messages.find((entry: { kind: string }) => entry.kind === 'fix_released')?.readAt ?? null
      }).not.toBeNull()
      const before = await (await reporter.request.get(`${app.apiUrl}/api/v1/inbox`)).json()
      const original = before.messages.find((entry: { kind: string }) => entry.kind === 'fix_released')
      expect(original.readAt).not.toBeNull()
      expect((await administrator.request.post(`${app.apiUrl}/api/admin/bug-report-feedback/duplicate`, { data: {
        issueNumber: duplicate, rootIssueNumber: issueNumber, requestId: 'late-ui-duplicate', expectedVersion: 0,
      } })).status()).toBe(200)
      await new BugReportFeedbackService(fixture).recordVerifiedDeployment('ui-deployment-01', proof)
      const after = await (await reporter.request.get(`${app.apiUrl}/api/v1/inbox`)).json()
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
      await expect(dialog.getByRole('heading', { name: '修复摘要', exact: true })).toBeVisible()
      await expect(dialog.getByText('Adds an explicit <discard> action for supply goods without advancing the current turn.', { exact: true })).toBeVisible()
      await expect(dialog.getByRole('link', { name: `查看 issue #${duplicate}`, exact: true })).toBeVisible()
      await expect(dialog.getByText('首次核验上线版本：v0.20.0', { exact: true })).toBeVisible()
      await expect(dialog.getByText('核验时的生产版本：v0.21.0', { exact: false })).toBeVisible()
      await expect(dialog.getByRole('link', { name: '查看 v0.21.0 版本', exact: true })).toHaveAttribute('href', 'https://github.com/titanxxh/open-agricola/releases/tag/v0.21.0')
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
