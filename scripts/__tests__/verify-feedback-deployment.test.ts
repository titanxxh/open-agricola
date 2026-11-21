// @covers scripts/release/verify-feedback-deployment.ts server/bug-report/feedback-owner-cli.ts
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { FULL_TASK_IDS } from '../ci/verification-tasks'
import { disposeFeedbackDeploymentFixtures, feedbackDeploymentFixture, ownerLocalFeedbackDeploymentFixture,
  resetFeedbackDeploymentFixtures, type FeedbackDeploymentState } from './_helpers/feedback-deployment-fixture'

// The PostgreSQL owner-process cases run feedback-owner-cli.ts from the candidate's app container in production, so
// they stay in release verification: verify-feedback-deployment-postgres.test.ts.
afterEach(resetFeedbackDeploymentFixtures)
afterAll(disposeFeedbackDeploymentFixtures)

describe('owner verified feedback deployment', () => {
  it('retains actual owner-local authorization and null Actions identities after the common native gate', async () => {
    const value = await ownerLocalFeedbackDeploymentFixture()
    const result = await value.confirm()
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ verification: 'passed', notification: { status: 'completed' } })
    const saved = JSON.parse(readFileSync(join(value.root, 'receipt.json'), 'utf8'))
    expect(statSync(join(value.root, 'receipt.json')).mode & 0o777).toBe(0o600)
    expect(saved.proof.candidate.ownerLocal).toMatchObject({ kind: 'owner-local', ownerId: 7, statusId: 10, releaseId: 11, assetId: 12,
      receiptSha256: value.status.description.slice('owner-local sha256:'.length), url: value.asset.browser_download_url })
    expect(saved.proof.candidate.tasks.map((task: { id: string }) => task.id)).toEqual(FULL_TASK_IDS)
    expect(saved.proof.candidate.tasks.every((task: { runId: unknown; jobId: unknown; url: string }) =>
      task.runId === null && task.jobId === null && task.url === value.asset.browser_download_url)).toBe(true)
    expect(value.events().find(event => event.kind === 'notification')?.input).toEqual(saved)
    expect(value.events().some(event => event.endpoint?.includes('/dispatches'))).toBe(false)
  })

  it.each(['foreign status', 'withdrawn owner status', 'foreign release author', 'foreign asset uploader', 'digest mismatch',
    'missing canonical task', 'failed local command', 'configuration mismatch'] as const)('blocks owner-local %s before observing or writing feedback', async failure => {
    const value = await ownerLocalFeedbackDeploymentFixture()
    if (failure === 'foreign status') value.status.creator = { ...value.owner, id: 8 }
    if (failure === 'withdrawn owner status') value.status.state = 'failure'
    if (failure === 'foreign release author') value.release.author = { ...value.owner, id: 8 }
    if (failure === 'foreign asset uploader') value.asset.uploader = { ...value.owner, id: 8 }
    if (failure === 'missing canonical task') value.receipt.tasks.pop()
    if (failure === 'failed local command') value.receipt.tasks[0].commands[0].exitCode = 1
    if (failure === 'configuration mismatch') value.receipt.configuration = 'f'.repeat(64)
    value.saveReceipt()
    if (failure === 'digest mismatch') { value.status.description = `owner-local sha256:${'f'.repeat(64)}`; value.save() }
    const result = await value.confirm()
    expect(result.status).toBe(1)
    expect(value.events().some(event => event.kind === 'http' || event.kind === 'ssh' || event.kind === 'notification')).toBe(false)
    expect(existsSync(join(value.root, 'receipt.json'))).toBe(false)
  })

  it.each(['frontend mismatch', 'backend mismatch', 'unready backend'] as const)('still blocks owner-local %s before notification', async failure => {
    const value = await ownerLocalFeedbackDeploymentFixture()
    if (failure === 'frontend mismatch') value.state.frontendSha = 'b'.repeat(40)
    if (failure === 'backend mismatch') value.state.backendSha = 'b'.repeat(40)
    if (failure === 'unready backend') value.state.ready = false
    value.save()
    const result = await value.confirm()
    expect(result.status).toBe(1)
    expect(value.events().filter(event => event.kind === 'notification')).toEqual([])
    expect(existsSync(join(value.root, 'receipt.json'))).toBe(false)
  })

  it('retries an owner-local receipt without reselecting proof or changing its operation, evidence or target', async () => {
    const value = await ownerLocalFeedbackDeploymentFixture()
    value.state.notification = 'offline'; value.save()
    const first = await value.confirm()
    expect(first.status, first.stderr).toBe(2)
    const path = join(value.root, 'receipt.json')
    const receipt = readFileSync(path, 'utf8')
    const before = value.events().length
    value.state.notification = 'completed'; value.state.frontendStatus = 500; value.state.ready = false
    value.status.state = 'failure'; value.save()
    const retried = await value.invoke('scripts/release/verify-feedback-deployment.ts', ['--retry', path])
    expect(retried.status, retried.stderr).toBe(0)
    expect(value.events().slice(before).map(event => event.kind)).toEqual(['ssh', 'notification'])
    expect(value.events().slice(before).at(-1)?.input).toEqual(JSON.parse(receipt))
    expect(readFileSync(path, 'utf8')).toBe(receipt)
  })

  it('observes a formal complete release and records its exact full ancestry without publishing or deploying', async () => {
    const value = await feedbackDeploymentFixture()
    const result = await value.confirm()
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({release:'verified',deployment:'observed',verification:'passed',notification:{status:'completed'}})
    const sent = value.events().find(event => event.kind === 'notification')
    expect(sent?.input).toMatchObject({proof:{release:{version:'v9.9.9',sha:value.sha},frontend:{gameBuildId:value.sha},backend:{gameBuildId:value.sha},ancestry:{format:'git-raw-closure-v1',commits:expect.arrayContaining([value.fixSha,value.sha])}}})
    expect(value.events().some(event => event.endpoint?.includes('dispatches'))).toBe(false)
    expect(readFileSync(join(value.root,'receipt.json'),'utf8')).toContain(value.sha)
  })
  it('refuses a tag moved while observing production before saving or notifying', async () => {
    const value = await feedbackDeploymentFixture()
    value.state.tagAfterRead = value.fixSha; value.save()
    const result = await value.confirm()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Release tag changed')
    expect(value.events().filter(event => event.kind === 'notification')).toEqual([])
    expect(existsSync(join(value.root, 'receipt.json'))).toBe(false)
  })

  it('retains original verified observation and operation identity when notification retry loses SSH', async () => {
    const value = await feedbackDeploymentFixture()
    value.state.notification = 'offline'; value.save()
    const first = await value.confirm()
    expect(first.status).toBe(2)
    const receipt = JSON.parse(readFileSync(join(value.root, 'receipt.json'), 'utf8'))
    expect(JSON.parse(first.stdout)).toMatchObject({ deployment: 'observed', verification: 'passed', notification: { operationId: receipt.operationId, status: 'pending' } })
    const before = value.events().length
    const retry = await value.invoke('scripts/release/verify-feedback-deployment.ts', ['--host', 'owner-test', '--retry', join(value.root, 'receipt.json')])
    expect(retry.status).toBe(2)
    expect(JSON.parse(retry.stdout)).toMatchObject({ release: 'unchanged', deployment: 'unchanged', verification: 'retained', notification: { operationId: receipt.operationId, status: 'pending' } })
    expect(value.events().slice(before).map(event => event.kind)).toEqual(['ssh', 'notification'])
  })

  it.each([
    ['draft', (state: FeedbackDeploymentState) => { state.release.draft = true }],
    ['prerelease', (state: FeedbackDeploymentState) => { state.release.prerelease = true }],
    ['foreign Release', (state: FeedbackDeploymentState) => { state.release.html_url = 'https://github.com/foreign/project/releases/tag/v9.9.9' }],
    ['unpublished Release', (state: FeedbackDeploymentState) => { state.release.published_at = '' }],
    ['unmerged candidate', (state: FeedbackDeploymentState) => { state.provenance[`repos/titanxxh/open-agricola/commits/${state.sha}/pulls?per_page=100`] = [] }],
    ['missing candidate verification', (state: FeedbackDeploymentState) => { state.evidence = 'missing' }],
    ['failed candidate verification', (state: FeedbackDeploymentState) => { state.evidence = 'failed' }],
    ['partial candidate verification', (state: FeedbackDeploymentState) => { state.evidence = 'partial' }],
    ['frontend-only deployment', (state: FeedbackDeploymentState) => { state.backendSha = 'b'.repeat(40) }],
    ['backend-only deployment', (state: FeedbackDeploymentState) => { state.frontendSha = 'b'.repeat(40) }],
    ['no frontend', (state: FeedbackDeploymentState) => { state.frontendStatus = 404 }],
    ['stopped backend', (state: FeedbackDeploymentState) => { state.running = false }],
    ['unready backend', (state: FeedbackDeploymentState) => { state.ready = false }],
    ['frontend base mismatch', (state: FeedbackDeploymentState) => { state.frontendBase = '/wrong/' }],
    ['browser-only build flag', (state: FeedbackDeploymentState) => { state.frontendBody = '{"verified":true,"released":true}' }],
    ['oversized frontend metadata', (state: FeedbackDeploymentState) => { state.frontendBody = ' '.repeat(5000) }],
  ] satisfies Array<[string, (state: FeedbackDeploymentState) => void]>)('blocks %s before any feedback write', async (_name, change) => {
    const value = await feedbackDeploymentFixture()
    change(value.state); value.save()
    const result = await value.confirm()
    expect(result.status).toBe(1)
    expect(value.events().filter(event => event.kind === 'notification')).toEqual([])
    expect(existsSync(join(value.root, 'receipt.json'))).toBe(false)
  })

  it('retries the original receipt successfully while release and production adapters are unavailable', async () => {
    const value = await feedbackDeploymentFixture()
    value.state.notification = 'pending'; value.save()
    const first = await value.confirm()
    expect(first.status).toBe(2)
    const receipt = readFileSync(join(value.root, 'receipt.json'), 'utf8')
    const before = value.events().length
    value.state.notification = 'completed'; value.state.release.draft = true; value.state.evidence = 'missing'
    value.state.frontendStatus = 500; value.state.ready = false; value.save()
    const retry = await value.invoke('scripts/release/verify-feedback-deployment.ts', ['--host', 'owner-test', '--retry', join(value.root, 'receipt.json')])
    expect(retry.status, retry.stderr).toBe(0)
    expect(JSON.parse(retry.stdout)).toMatchObject({ deployment: 'unchanged', verification: 'retained', notification: { status: 'completed' } })
    expect(value.events().slice(before).map(event => event.kind)).toEqual(['ssh', 'notification'])
    expect(value.events().slice(before).at(-1)?.input).toEqual(JSON.parse(receipt))
    expect(readFileSync(join(value.root, 'receipt.json'), 'utf8')).toBe(receipt)
  })

  it('inspects and retries persisted operations without release, frontend or deployment reads', async () => {
    const value = await feedbackDeploymentFixture()
    const status = await value.invoke('scripts/release/verify-feedback-deployment.ts', ['--host', 'owner-test', '--status', 'operations'])
    expect(status.status, status.stderr).toBe(0)
    expect(JSON.parse(status.stdout)).toEqual({ operations: [] })
    const retry = await value.invoke('scripts/release/verify-feedback-deployment.ts', ['--host', 'owner-test', '--retry-operation', 'assessment:known-operation'])
    expect(retry.status, retry.stderr).toBe(0)
    expect(JSON.parse(retry.stdout)).toMatchObject({ deployment: 'unchanged', verification: 'retained', notification: { operationId: 'assessment:known-operation', status: 'completed' } })
    expect(value.events().map(event => event.kind)).toEqual(['ssh', 'ssh', 'notification'])
  })

  it('refuses owner verification in CI before opening any external connection', async () => {
    const value = await feedbackDeploymentFixture()
    value.env.CI = 'true'
    const result = await value.confirm()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('owner-controlled machine')
    expect(value.events()).toEqual([])
  })

  it('rejects a shallow ancestry proof and ignores grafted parent truncation', async () => {
    const value = await feedbackDeploymentFixture()
    mkdirSync(join(value.root, '.git/info'), { recursive: true })
    writeFileSync(join(value.root, '.git/info/grafts'), value.sha + '\n')
    const grafted = await value.confirm()
    expect(grafted.status, grafted.stderr).toBe(0)
    expect(value.events().find(event => event.kind === 'notification')?.input).toMatchObject({ proof: { ancestry: { commits: expect.arrayContaining([value.fixSha, value.sha]) } } })
    rmSync(join(value.root, 'receipt.json'))
    writeFileSync(join(value.root, '.git/shallow'), value.fixSha + '\n')
    const before = value.events().filter(event => event.kind === 'notification').length
    const shallow = await value.confirm()
    expect(shallow.status).toBe(1)
    expect(shallow.stderr).toContain('non-shallow')
    expect(value.events().filter(event => event.kind === 'notification')).toHaveLength(before)
  })

  it('reports a persisted notification retry transport failure without changing deployment status', async () => {
    const value = await feedbackDeploymentFixture()
    value.state.notification = 'offline'; value.save()
    const retry = await value.invoke('scripts/release/verify-feedback-deployment.ts', ['--host', 'owner-test', '--retry-operation', 'assessment:known-operation'])
    expect(retry.status).toBe(2)
    expect(JSON.parse(retry.stdout)).toMatchObject({release:'unchanged',deployment:'unchanged',verification:'retained',notification:{operationId:'assessment:known-operation',status:'pending'}})
    expect(value.events().map(event => event.kind)).toEqual(['ssh', 'notification'])
  })

  it.each([
    ['--host', 'another-owner-host'],
    ['--remote-dir', '/srv/another-game'],
  ])('rejects a receipt retry with conflicting %s before any SSH', async (flag, conflicting) => {
    const value = await feedbackDeploymentFixture()
    value.state.notification = 'offline'; value.save()
    expect((await value.confirm()).status).toBe(2)
    const before = value.events().length
    value.state.notification = 'completed'; value.save()
    const retry = await value.invoke('scripts/release/verify-feedback-deployment.ts', ['--retry', join(value.root, 'receipt.json'), flag, conflicting])
    expect(retry.status).toBe(1)
    expect(retry.stderr).toContain('Retry target does not match the saved receipt')
    expect(value.events().slice(before)).toEqual([])
  })

  it('reuses the saved host and directory when receipt retry omits target flags', async () => {
    const value = await feedbackDeploymentFixture()
    value.state.notification = 'offline'; value.save()
    expect((await value.confirm()).status).toBe(2)
    const receiptPath = join(value.root, 'receipt.json')
    expect(JSON.parse(readFileSync(receiptPath, 'utf8'))).toMatchObject({ target: { host: 'owner-test', remoteDir: '/srv/open-agricola' } })
    const before = value.events().length
    value.state.notification = 'completed'; value.state.evidence = 'missing'; value.state.ready = false; value.save()
    const retry = await value.invoke('scripts/release/verify-feedback-deployment.ts', ['--retry', receiptPath])
    expect(retry.status, retry.stderr).toBe(0)
    expect(JSON.parse(retry.stdout)).toMatchObject({ deployment: 'unchanged', verification: 'retained', notification: { status: 'completed' } })
    const events = value.events().slice(before)
    expect(events.map(event => event.kind)).toEqual(['ssh', 'notification'])
    expect(events[0].args?.at(-2)).toBe('owner-test')
    expect(events[0].args?.at(-1)).toContain("cd -- '/srv/open-agricola'")
  })
})
