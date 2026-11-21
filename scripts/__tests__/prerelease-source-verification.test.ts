import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { checkPrereleaseVerification, fixPrereleaseCandidate, requestPrereleaseVerification } from '../ci/prerelease-verification'
import { commitRef, github, RELEASE_REPOSITORY } from '../ci/release-github'
import { readSourceProof, routineSourcePaths, verifySourceUpdate } from '../prerelease/source-verification'

vi.mock('../ci/prerelease-verification', async importOriginal => ({
  ...await importOriginal<typeof import('../ci/prerelease-verification')>(),
  fixPrereleaseCandidate: vi.fn(), checkPrereleaseVerification: vi.fn(), requestPrereleaseVerification: vi.fn(),
}))
vi.mock('../ci/release-github', async importOriginal => ({
  ...await importOriginal<typeof import('../ci/release-github')>(), github: vi.fn(), commitRef: vi.fn(),
}))
vi.mock('node:timers/promises', async importOriginal => ({
  ...await importOriginal<typeof import('node:timers/promises')>(), setTimeout: vi.fn(),
}))

const roots: string[] = []
afterEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture(options: { policyChange?: string; change?: string } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'source-ci-test-'))
  roots.push(cwd)
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const add = (file: string) => {
    mkdirSync(dirname(join(cwd, file)), { recursive: true }); writeFileSync(join(cwd, file), 'change'); git('add', file); git('commit', '-m', file)
    return git('rev-parse', 'HEAD')
  }
  git('init', '-b', 'main'); git('config', 'user.email', 'test@example.org'); git('config', 'user.name', 'Test')
  const producer = add('README.md')
  git('switch', '-c', 'prerelease')
  const from = options.policyChange ? add(options.policyChange) : producer
  const sha = add(options.change ?? 'shared/cards/A/A001_Card.ts')
  git('switch', 'main')
  const binding = { from, sha, producer }
  const repository = { id: 7, full_name: RELEASE_REPOSITORY }
  vi.mocked(fixPrereleaseCandidate).mockReturnValue({ repositoryId: repository.id, main: producer })
  vi.mocked(commitRef).mockReturnValue(sha)
  const branch = `verification/prerelease/${sha}`
  const run = { id: 11, workflow_id: 22, path: '.github/workflows/ci.yml', head_sha: sha, run_attempt: 2, status: 'completed', conclusion: 'success',
    event: 'push', head_branch: 'prerelease', repository, head_repository: repository }
  const jobs = [['plan', 'Compute canonical verification plan'], ['verify', 'Require every selected check to succeed']].map(([name, step]) => ({
    name, run_id: 11, run_attempt: 2, head_sha: sha, status: 'completed', conclusion: 'success', steps: [{ name: step, status: 'completed', conclusion: 'success' }],
  }))
  const plan = { status: 'planned', schemaVersion: 1, mode: 'scoped', identity: { baseSha: from, mergeBaseSha: from, headSha: sha, testedSha: sha } }
  const artifact = { id: 83, name: 'verification-plan-11-2', expired: false }
  const publishPlan = () => {
    writeFileSync(join(cwd, 'scoped-plan.json'), JSON.stringify(plan))
    execFileSync('zip', ['-q', '-FS', 'plan.zip', 'scoped-plan.json'], { cwd })
  }
  publishPlan()
  mkdirSync(join(cwd, 'bin'))
  writeFileSync(join(cwd, 'bin/gh'), `#!/bin/sh\ncat "${cwd}/plan.zip"\n`)
  chmodSync(join(cwd, 'bin/gh'), 0o700)
  vi.stubEnv('PATH', join(cwd, 'bin') + delimiter + process.env.PATH)
  let runs: unknown[] = [run]
  let afterDispatch: (() => void) | undefined
  const dispatches: unknown[] = []
  vi.mocked(github).mockImplementation((_repo, endpoint, body) => {
    if (endpoint === 'actions/workflows/ci.yml') return { path: run.path, id: 22 }
    if (endpoint === `actions/workflows/22/runs?head_sha=${sha}&per_page=100`) return { workflow_runs: runs }
    if (endpoint === `actions/runs/${run.id}/attempts/2/jobs?per_page=100`) return { jobs }
    if (endpoint === `actions/runs/${run.id}/artifacts?per_page=100`) return { artifacts: [artifact] }
    if (endpoint === 'actions/workflows/22/dispatches' && afterDispatch) { dispatches.push(body); afterDispatch(); return null }
    throw new Error(`Unexpected GitHub request: ${endpoint}`)
  })
  const dispatch = (initial: unknown[], change?: () => void) => {
    runs = initial
    afterDispatch = () => {
      change?.()
      run.id = 12; run.event = 'workflow_dispatch'; run.head_branch = branch
      jobs.forEach(job => { job.run_id = 12 }); artifact.name = 'verification-plan-12-2'
      runs = [run]
    }
  }
  return { cwd, binding, branch, run, jobs, plan, artifact, publishPlan, dispatch, dispatches, git, add }
}

it('requires native CI for both the pinned source and actual installed base', async () => {
  const f = fixture()
  const proof = await verifySourceUpdate(f.cwd, f.binding)
  expect(readSourceProof(proof)).toEqual({ ...f.binding, kind: 'prerelease-source', scope: 'routine', runId: 11, attempt: 2 })
  for (const bad of [{ attempt: 0 }, { sha: 'HEAD' }, { from: 'main' }, { runId: null }, { scope: 'full' }, { producer: 'latest' }])
    expect(() => readSourceProof({ ...proof, ...bad })).toThrow()
  expect(fixPrereleaseCandidate).toHaveBeenCalledWith(f.cwd, RELEASE_REPOSITORY, f.binding.sha, { allowEarlierBaseline: true })
})

it.each(['pull request', 'foreign head', 'wrong workflow', 'wrong branch', 'wrong sha', 'wrong source repo'])('dispatches on the pinned ref when existing evidence has %s', async reason => {
  const f = fixture()
  const invalid = { ...f.run }
  if (reason === 'pull request') invalid.event = 'pull_request'
  if (reason === 'foreign head') invalid.head_repository = { ...invalid.head_repository, id: 21 }
  if (reason === 'wrong workflow') invalid.path = '.github/workflows/candidate.yml'
  if (reason === 'wrong branch') invalid.head_branch = 'feature'
  if (reason === 'wrong sha') invalid.head_sha = f.binding.from
  if (reason === 'wrong source repo') invalid.repository = { id: 7, full_name: 'other/repo' }
  f.dispatch([invalid])
  expect(await verifySourceUpdate(f.cwd, f.binding)).toMatchObject({ scope: 'routine', runId: 12 })
  expect(f.dispatches).toEqual([{ ref: f.branch, inputs: { base_sha: f.binding.from } }])
})

it.each(['earlier base', 'other merge base', 'untested head', 'wrong checkout', 'expired artifact', 'skipped gate', 'prior attempt', 'other job SHA'])('refuses dispatched CI with %s', async reason => {
  const f = fixture()
  if (reason === 'earlier base') f.plan.identity.baseSha = f.binding.sha
  if (reason === 'other merge base') f.plan.identity.mergeBaseSha = f.binding.sha
  if (reason === 'untested head') f.plan.identity.headSha = f.binding.from
  if (reason === 'wrong checkout') f.plan.identity.testedSha = f.binding.from
  if (reason === 'expired artifact') f.artifact.expired = true
  if (reason === 'skipped gate') f.jobs[1].steps[0].conclusion = 'skipped'
  if (reason === 'prior attempt') f.jobs[0].run_attempt = 1
  if (reason === 'other job SHA') f.jobs[1].head_sha = f.binding.from
  rmSync(join(f.cwd, 'plan.zip')); f.publishPlan(); f.dispatch([f.run])
  await expect(verifySourceUpdate(f.cwd, f.binding)).rejects.toThrow(/lacks the required gate or matching comparison plan/)
  expect(f.dispatches).toHaveLength(1)
})

it('stops at failed native CI and never accepts an unverifiable policy producer', async () => {
  const f = fixture()
  f.run.conclusion = 'failure'
  await expect(verifySourceUpdate(f.cwd, f.binding)).rejects.toThrow(/did not pass/)
  await expect(verifySourceUpdate(f.cwd, { ...f.binding, producer: f.binding.sha })).rejects.toThrow(/protected main/)
  expect(f.dispatches).toHaveLength(0)
})

it.each(['.github/workflows/candidate-rehearsal.yml', 'scripts/scoped-check.ts', 'vitest.config.ts', 'package.json'])('uses complete verification for a pre-existing %s change despite a card-only update', async policyChange => {
  const f = fixture({ policyChange })
  const record = { status: 'passed' as const, repository: RELEASE_REPOSITORY, channel: 'prerelease' as const, sha: f.binding.sha, configuration: 'abc', producerConfiguration: 'abc', ownerLocal: undefined, tasks: [] }
  vi.mocked(checkPrereleaseVerification).mockReturnValue(record)
  expect(await verifySourceUpdate(f.cwd, f.binding)).toEqual({ ...f.binding, kind: 'prerelease-source', scope: 'full', runId: null, attempt: null })
  expect(github).not.toHaveBeenCalled()
})

it('also requires the current protected verification policy when the installed owner policy is older', async () => {
  const f = fixture()
  const current = f.add('.github/workflows/scoped-verification.yml')
  f.git('switch', '--detach', f.binding.producer)
  vi.mocked(fixPrereleaseCandidate).mockReturnValue({ repositoryId: 7, main: current })
  vi.mocked(checkPrereleaseVerification).mockReturnValue({ status: 'passed', repository: RELEASE_REPOSITORY, channel: 'prerelease',
    sha: f.binding.sha, configuration: 'abc', producerConfiguration: 'abc', ownerLocal: undefined, tasks: [] })
  expect(await verifySourceUpdate(f.cwd, f.binding)).toMatchObject({ scope: 'full' })
  expect(github).not.toHaveBeenCalled()
  // Evidence produced under the installed owner policy still qualifies after main changes its configuration.
  expect(checkPrereleaseVerification).toHaveBeenCalledWith(f.cwd, RELEASE_REPOSITORY, f.binding.sha, { producerSha: f.binding.producer })
})

it('requests only missing full tasks and stops on their first completed unsuccessful result', async () => {
  const f = fixture({ change: 'server/auth/guards.ts' })
  const record = { status: 'blocked' as const, repository: RELEASE_REPOSITORY, channel: 'prerelease' as const, sha: f.binding.sha, configuration: 'abc', producerConfiguration: 'abc', ownerLocal: undefined }
  const task = { id: 'fast' as const, status: 'blocked' as const, reason: 'No verified task evidence', runId: null, jobId: null, url: null }
  vi.mocked(checkPrereleaseVerification).mockReturnValueOnce({ ...record, tasks: [task] })
    .mockReturnValueOnce({ ...record, tasks: [{ ...task, runId: 15, reason: 'Required candidate task is failure' }] })
  vi.mocked(github).mockReturnValue({ status: 'completed' })
  await expect(verifySourceUpdate(f.cwd, f.binding)).rejects.toThrow(/blocked by fast/)
  expect(requestPrereleaseVerification).toHaveBeenCalledExactlyOnceWith(f.cwd, RELEASE_REPOSITORY, f.binding.sha, 'fast')
})

it('sends shared infrastructure, unknown paths and mixed or empty changes through full verification', () => {
  const ordinary = ['shared/cards/A/A001_Card.ts', 'shared/cards/classic/CI/CI097_Slaughterhouse.ts', 'client/components/board/GameBoard.tsx', 'docs/example.md',
    'client/styles/board.css', 'server/__tests__/single-card.test.ts', 'prerelease-integration.json']
  expect(routineSourcePaths(ordinary)).toBe(true)
  expect(routineSourcePaths([])).toBe(false)
  for (const file of ['shared/cards/active-registry.ts', 'server/room-persistence.ts', 'deploy/prerelease-runtime/Dockerfile', 'client/components/Login.tsx', 'pnpm-lock.yaml', 'new/unknown.ts'])
    expect(routineSourcePaths([...ordinary, file])).toBe(false)
})
