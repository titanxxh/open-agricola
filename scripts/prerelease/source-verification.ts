import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { checkPrereleaseVerification, fixPrereleaseCandidate, prereleaseCandidateRef, requestPrereleaseVerification } from '../ci/prerelease-verification'
import { assertRawCommit } from '../ci/candidate-verification'
import { fullSha } from '../ci/verification-tasks'
import { commitRef, github, RELEASE_REPOSITORY } from '../release/candidate'

type Binding = { sha: string; from: string; producer: string }
export type SourceProof = Binding & { kind: 'prerelease-source'; scope: 'routine' | 'full'; runId: number | null; attempt: number | null }

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? Object.fromEntries(Object.entries(value)) : {}
const git = (cwd: string, args: string[]) => execFileSync('git', ['--no-replace-objects', ...args], { cwd, encoding: 'utf8' }).trimEnd()

const positiveInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0

export function readSourceProof(value: unknown): SourceProof {
  const row = object(value)
  if (row.kind !== 'prerelease-source' || (row.scope !== 'routine' && row.scope !== 'full') ||
    typeof row.sha !== 'string' || typeof row.from !== 'string' || typeof row.producer !== 'string') throw new Error('Invalid prerelease source proof')
  for (const sha of [row.sha, row.from, row.producer]) fullSha(sha)
  if (row.scope === 'full' && row.runId === null && row.attempt === null)
    return { kind: row.kind, scope: row.scope, sha: row.sha, from: row.from, producer: row.producer, runId: null, attempt: null }
  if (row.scope !== 'routine' || !positiveInteger(row.runId) || !positiveInteger(row.attempt)) throw new Error('Invalid routine CI run binding')
  return { kind: row.kind, scope: row.scope, sha: row.sha, from: row.from, producer: row.producer, runId: row.runId, attempt: row.attempt }
}

// Only local card implementations, presentation, documentation and their tests can take the routine route.
export function routineSourcePaths(paths: string[]): boolean {
  return paths.length > 0 && paths.every(path =>
    /^(?:shared\/cards\/(?:[A-E]|M|classic\/[A-Z]+)\/[A-Za-z]+[0-9]+_[a-zA-Z0-9_]+\.ts|client\/components\/(?:board|interaction|effects|header)\/[\w/-]+\.(?:ts|tsx|css)|client\/styles\/[\w/-]+\.css)$/.test(path)
    || /^docs\/[\w./-]+\.md$/.test(path) || path === 'prerelease-integration.json' || path === 'client/App.css' || path === 'client/index.css'
    || /^(?:server|shared\/cards(?:\/[\w-]+)*)\/__tests__\/[\w/-]+\.test\.ts$/.test(path))
}

const workflowPath = '.github/workflows/ci.yml'

// Include the workflow, reusable jobs, install hooks, config, tooling and any new root-level or infrastructure paths.
function routinePolicyMatches(cwd: string, binding: Binding, currentMain: string) {
  const changed = (base: string) => git(cwd, ['diff', '--ignore-submodules=none', '--no-renames', '--name-only', '-z', base, binding.sha, '--']).split('\0').filter(Boolean)
  if (!routineSourcePaths(changed(binding.from))) return false
  const ancestor = spawnSync('git', ['--no-replace-objects', 'merge-base', '--is-ancestor', binding.from, binding.sha], { cwd })
  if (ancestor.status === 1) return false
  if (ancestor.status !== 0) throw new Error('Could not establish source ancestry')
  const policySources = new Set([binding.producer, currentMain])
  for (const source of policySources) {
    if (changed(source).some(path => !/^(?:shared|server|client|docs|e2e-tests|replay-viewer|assets|public)\//.test(path) && path !== 'prerelease-integration.json')) return false
  }
  return true
}

function eligibleRun(row: Record<string, unknown>, sha: string, workflowId: number, repositoryId: number) {
  const repoMatches = (repo: unknown) => object(repo).full_name === RELEASE_REPOSITORY && object(repo).id === repositoryId
  return row.head_sha === sha && row.workflow_id === workflowId && row.path === workflowPath && repoMatches(row.head_repository) && repoMatches(row.repository)
    && (row.event === 'push' && row.head_branch === 'prerelease' || row.event === 'workflow_dispatch' && row.head_branch === prereleaseCandidateRef(sha))
}

function passedStep(jobs: Record<string, unknown>[], jobName: string, stepName: string, id: number, attempt: number, sha: string) {
  const matching = jobs.filter(job => job.name === jobName)
  if (matching.length !== 1) return false
  const [job] = matching
  if (job.run_id !== id || job.run_attempt !== attempt || job.head_sha !== sha || job.status !== 'completed' || job.conclusion !== 'success' || !Array.isArray(job.steps)) return false
  const steps = job.steps.map(object).filter(step => step.name === stepName)
  return steps.length === 1 && steps[0].status === 'completed' && steps[0].conclusion === 'success'
}

function routinePlanMatches(id: number, attempt: number, binding: Binding) {
  const jobs = object(github(RELEASE_REPOSITORY, `actions/runs/${id}/attempts/${attempt}/jobs?per_page=100`))
  if (!Array.isArray(jobs.jobs)) throw new Error('Missing routine CI job evidence')
  const native = jobs.jobs.map(object)
  if (!passedStep(native, 'plan', 'Compute canonical verification plan', id, attempt, binding.sha)
    || !passedStep(native, 'verify', 'Require every selected check to succeed', id, attempt, binding.sha)) return false
  const artifact = `verification-plan-${id}-${attempt}`
  const listing = object(github(RELEASE_REPOSITORY, `actions/runs/${id}/artifacts?per_page=100`))
  if (!Array.isArray(listing.artifacts)) throw new Error('Missing routine CI artifact metadata')
  const matches = listing.artifacts.map(object).filter(row => row.name === artifact && row.expired === false)
  if (matches.length !== 1 || !positiveInteger(matches[0].id)) return false
  const directory = mkdtempSync(join(tmpdir(), 'oa-source-plan-'))
  try {
    const zip = execFileSync('gh', ['api', `repos/${RELEASE_REPOSITORY}/actions/artifacts/${matches[0].id}/zip`], { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 })
    const file = join(directory, 'plan.zip')
    writeFileSync(file, zip)
    const plan = object(JSON.parse(execFileSync('unzip', ['-p', file, 'scoped-plan.json'], { encoding: 'utf8', timeout: 15_000, maxBuffer: 32 * 1024 * 1024 })))
    const identity = object(plan.identity)
    return plan.schemaVersion === 1 && plan.status === 'planned' && (plan.mode === 'scoped' || plan.mode === 'full')
      && identity.baseSha === binding.from && identity.mergeBaseSha === binding.from && identity.headSha === binding.sha && identity.testedSha === binding.sha
  } finally { rmSync(directory, { recursive: true, force: true }) }
}

async function requireFullVerification(cwd: string, sha: string, deadline: number) {
  let requested = false
  while (Date.now() < deadline) {
    const result = checkPrereleaseVerification(cwd, RELEASE_REPOSITORY, sha)
    if (result.status === 'passed') return
    const missing = []
    const statusByRun = new Map<number, unknown>()
    for (const task of result.tasks) {
      if (task.status === 'passed') continue
      if (task.runId === null) { missing.push(task.id); continue }
      if (task.reason === 'Candidate run has not completed') continue
      if (!statusByRun.has(task.runId)) statusByRun.set(task.runId, object(github(RELEASE_REPOSITORY, `actions/runs/${task.runId}`)).status)
      if (statusByRun.get(task.runId) === 'completed') throw new Error(`Complete verification blocked by ${task.id}: ${task.reason} (${task.url})`)
    }
    if (!requested && missing.length) {
      requestPrereleaseVerification(cwd, RELEASE_REPOSITORY, sha, missing.join(','))
      requested = true
    }
    await setTimeout(15_000)
  }
  throw new Error('Timed out waiting for complete prerelease verification')
}

export async function verifySourceUpdate(cwd: string, binding: Binding, forceFull = false): Promise<SourceProof> {
  const { sha, from, producer } = binding
  for (const ref of [sha, from, producer]) fullSha(ref)
  const authority = fixPrereleaseCandidate(cwd, RELEASE_REPOSITORY, sha, { allowEarlierBaseline: true })
  assertRawCommit(cwd, RELEASE_REPOSITORY, producer)
  assertRawCommit(cwd, RELEASE_REPOSITORY, from)
  if (git(cwd, ['rev-parse', 'HEAD']) !== producer || git(cwd, ['merge-base', producer, authority.main]) !== producer)
    throw new Error('Source verification policy must be the checked-out commit on protected main')
  const deadline = Date.now() + 2 * 60 * 60_000
  if (forceFull || !routinePolicyMatches(cwd, binding, authority.main)) {
    await requireFullVerification(cwd, sha, deadline)
    return { kind: 'prerelease-source', ...binding, scope: 'full', runId: null, attempt: null }
  }
  const workflow = object(github(RELEASE_REPOSITORY, 'actions/workflows/ci.yml'))
  if (workflow.path !== workflowPath || !positiveInteger(workflow.id)) throw new Error('Unexpected routine workflow')
  const workflowId = workflow.id
  const branch = prereleaseCandidateRef(sha)
  let beforeDispatch: Set<number> | undefined
  while (Date.now() < deadline) {
    const listing = object(github(RELEASE_REPOSITORY, `actions/workflows/${workflow.id}/runs?head_sha=${sha}&per_page=100`))
    if (!Array.isArray(listing.workflow_runs)) throw new Error('Missing workflow runs')
    const runs = listing.workflow_runs.map(object).filter(row => eligibleRun(row, sha, workflowId, authority.repositoryId)).map(row => {
      if (!positiveInteger(row.id) || !positiveInteger(row.run_attempt)) throw new Error('Missing CI run identity')
      return { id: row.id, attempt: row.run_attempt, status: row.status, event: row.event, conclusion: row.conclusion, url: row.html_url }
    }).sort((a, b) => b.id - a.id)
    const [run] = runs
    if (run?.status === 'completed') {
      if (run.conclusion !== 'success') throw new Error(`Routine CI did not pass: ${run.url}`)
      if (routinePlanMatches(run.id, run.attempt, binding))
        return { kind: 'prerelease-source', ...binding, scope: 'routine', runId: run.id, attempt: run.attempt }
      if (beforeDispatch && !beforeDispatch.has(run.id) && run.event === 'workflow_dispatch') throw new Error('Dispatched CI run lacks the required gate or matching comparison plan')
    }
    if ((!run || run.status === 'completed') && !beforeDispatch) {
      beforeDispatch = new Set(runs.map(row => row.id))
      if (commitRef(RELEASE_REPOSITORY, `heads/${branch}`) !== sha) throw new Error('Pinned source ref changed')
      github(RELEASE_REPOSITORY, `actions/workflows/${workflow.id}/dispatches`, { ref: branch, inputs: { base_sha: from } })
    }
    await setTimeout(15_000)
  }
  throw new Error(`Timed out waiting for routine CI for ${sha}`)
}
