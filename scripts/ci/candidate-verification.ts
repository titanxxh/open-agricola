import { execFileSync, spawnSync } from 'node:child_process'
import { candidateExecution, executeCandidate, printVerificationOutput } from './candidate-isolation.ts'
import { createHash } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FULL_TASK_IDS, fullSha, selectedTasks, taskCommands, verificationConfiguration, verificationTask, type FullTaskId } from './verification-tasks.ts'

export const CANDIDATE_WORKFLOW = '.github/workflows/candidate-verification.yml'
export const PRERELEASE_CANDIDATE_WORKFLOW = '.github/workflows/prerelease-candidate-verification.yml'
export type ReleaseChannel = 'stable' | 'prerelease'
export type CandidateIdentity = { repository: string; repositoryId: number; sha: string; configuration: string; workflowId: number }
  & ({ channel?: 'stable'; execution: 'legacy-stable' }
    | { channel: 'stable' | 'prerelease'; execution: 'uid-rootless-v1'; producerShas: readonly string[] })
export type CandidateRunEvidence = { run: unknown; jobs: readonly unknown[] }
export type CandidateTaskResult = {
  id: FullTaskId
  status: 'passed' | 'blocked'
  reason: string | null
  runId: number | null
  jobId: number | null
  url: string | null
}
export type CandidateVerificationResult = {
  status: 'passed' | 'blocked'
  repository: string
  sha: string
  configuration: string
  tasks: CandidateTaskResult[]
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const object = (value: unknown): Record<string, unknown> => {
  if (!isObject(value)) throw new Error('Invalid GitHub evidence object')
  return value
}
const string = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('Invalid GitHub evidence string')
  return value
}
const integer = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 1) throw new Error('Invalid GitHub evidence identifier')
  return value
}
const conclusion = (value: unknown): string | null => value === null || value === undefined ? null : string(value)
const timestamp = (value: unknown): number | null => {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function parseRun(value: unknown) {
  const run = object(value)
  const repository = object(run.repository)
  const headRepository = object(run.head_repository)
  return {
    id: integer(run.id), workflowId: integer(run.workflow_id), path: string(run.path), event: string(run.event),
    sha: string(run.head_sha), repository: string(repository.full_name),
    repositoryId: integer(repository.id), headRepositoryId: integer(headRepository.id),
    status: string(run.status), attempt: integer(run.run_attempt), updatedAt: timestamp(run.updated_at), url: string(run.html_url),
  }
}

function parseJob(value: unknown) {
  const job = object(value)
  if (job.steps !== undefined && !Array.isArray(job.steps)) throw new Error('Invalid GitHub job steps')
  return {
    id: integer(job.id), runId: integer(job.run_id), name: string(job.name), status: string(job.status), conclusion: conclusion(job.conclusion),
    attempt: integer(job.run_attempt), url: string(job.html_url),
    createdAt: timestamp(job.created_at), startedAt: timestamp(job.started_at), completedAt: timestamp(job.completed_at),
    steps: (job.steps ?? []).map((entry: unknown) => {
      const step = object(entry)
      return { name: string(step.name), status: string(step.status), conclusion: conclusion(step.conclusion) }
    }),
  }
}

type Job = ReturnType<typeof parseJob>
type ExecutionTime = { start: number; end: number | null }
type TaskExecution = { result: CandidateTaskResult; time: ExecutionTime | null }

function executionTime(job: Job): ExecutionTime | null {
  if (job.status === 'completed') {
    return job.startedAt !== null && job.completedAt !== null && job.completedAt >= job.startedAt
      ? { start: job.startedAt, end: job.completedAt } : null
  }
  const start = job.startedAt ?? job.createdAt
  return start !== null && job.completedAt === null ? { start, end: null } : null
}

function latestExecution(executions: TaskExecution[]): CandidateTaskResult {
  const unknown = executions.find(execution => execution.time === null)
  if (unknown) return { ...unknown.result, status: 'blocked', reason: 'Candidate task execution chronology is missing or invalid' }
  const ordered = executions.flatMap(execution => execution.time ? [{ result: execution.result, time: execution.time }] : [])
    .sort((a, b) => b.time.start - a.time.start)
  const latest = ordered[0]
  if (ordered.slice(1).some(execution => execution.time.end === null || execution.time.end >= latest.time.start)) {
    return { ...latest.result, status: 'blocked', reason: 'Candidate task execution chronology is ambiguous' }
  }
  return latest.result
}

const successfulStep = (job: Job, name: string): boolean =>
  job.steps.filter(step => step.name === name).length === 1
  && job.steps.some(step => step.name === name && step.status === 'completed' && step.conclusion === 'success')
const newestJob = (jobs: Job[]): Job | undefined => [...jobs].sort((a, b) => b.attempt - a.attempt || b.id - a.id)[0]

function manifestSelection(jobs: Job[], identity: CandidateIdentity, producerSha: string): { tasks: FullTaskId[]; job: Job } | null {
  const manifest = newestJob(jobs.filter(job => job.name === 'candidate-manifest'))
  if (!manifest || manifest.status !== 'completed' || manifest.conclusion !== 'success'
    || !successfulStep(manifest, 'Generate candidate manifest')) return null
  const prefix = identity.channel === 'prerelease'
    ? `Prerelease manifest / ${identity.repositoryId} / prerelease / ${identity.sha} / ${identity.configuration} / ${producerSha} / `
    : identity.execution === 'legacy-stable' ? `Candidate manifest / ${identity.sha} / ${identity.configuration} / `
      : `Stable manifest / ${identity.repositoryId} / stable / ${identity.sha} / ${identity.configuration} / ${producerSha} / `
  const bindings = manifest.steps.filter(step => step.name.startsWith(prefix))
  if (bindings.length !== 1 || !successfulStep(manifest, bindings[0].name)) return null
  try {
    const selection = selectedTasks(bindings[0].name.slice(prefix.length))
    return selection.join(',') === bindings[0].name.slice(prefix.length) ? { tasks: selection, job: manifest } : null
  } catch { return null }
}

export function evaluateCandidateVerification(identity: CandidateIdentity, evidence: readonly CandidateRunEvidence[]): CandidateVerificationResult {
  fullSha(identity.sha)
  integer(identity.repositoryId)
  if (!/^[a-f0-9]{64}$/.test(identity.configuration)) throw new Error('Invalid verification configuration hash')
  const results = new Map<FullTaskId, CandidateTaskResult>(FULL_TASK_IDS.map(id => [id, {
    id, status: 'blocked', reason: 'No verified task evidence', runId: null, jobId: null, url: null,
  }]))
  const executions = new Map<FullTaskId, TaskExecution[]>()
  const runs = evidence.map(entry => ({ run: parseRun(entry.run), jobs: entry.jobs.map(parseJob) }))
    .filter(({ run }) => run.repository.toLowerCase() === identity.repository.toLowerCase()
      && run.repositoryId === identity.repositoryId && run.headRepositoryId === identity.repositoryId
      && (identity.execution === 'legacy-stable' ? run.sha === identity.sha : identity.producerShas.includes(run.sha))
      && run.workflowId === identity.workflowId
      && run.path === (identity.channel === 'prerelease' ? PRERELEASE_CANDIDATE_WORKFLOW : CANDIDATE_WORKFLOW)
      && run.event === 'workflow_dispatch')
  for (const { run, jobs } of runs) {
    const compatibleJobs = jobs.every(job => job.runId === run.id && job.attempt <= run.attempt)
    const hasCurrentAttempt = jobs.some(job => job.attempt === run.attempt)
    const endedAt = run.status === 'completed' ? run.updatedAt : null
    const completionBound = endedAt !== null && jobs.every(job => [job.createdAt, job.startedAt, job.completedAt]
      .every(time => time === null || time <= endedAt)) ? { start: endedAt, end: endedAt } : null
    const selection = compatibleJobs ? manifestSelection(jobs, identity, run.sha) : null
    const manifest = newestJob(jobs.filter(job => job.name === 'candidate-manifest'))
    for (const id of selection?.tasks ?? FULL_TASK_IDS) {
      const name = `candidate / ${id} / ${identity.configuration}`
      const candidates = jobs.filter(job => job.name === name)
      const job = newestJob(candidates.filter(candidate => !selection || candidate.attempt >= selection.job.attempt))
      const requiredSteps = ['Checkout candidate', 'Install dependencies', 'Verify candidate checkout', 'Execute verification task']
      if (identity.channel === 'prerelease' || identity.execution === 'uid-rootless-v1') requiredSteps.push(
        'Prepare candidate isolation', 'Prove native candidate isolation', 'Stop candidate descendants and collect private diagnostics')
      if (verificationTask(id).browser) requiredSteps.push('Install browsers')
      let reason: string | null = null
      if (!hasCurrentAttempt) reason = 'Current candidate attempt has no job evidence'
      else if (!selection) reason = 'Candidate manifest is missing, unsuccessful or incompatible'
      else if (run.status !== 'completed') reason = 'Candidate run has not completed'
      else if (!job) reason = 'Required candidate task was not run'
      else if (candidates.filter(candidate => candidate.attempt === job.attempt).length !== 1) reason = 'Duplicate required candidate task'
      else if (job.status !== 'completed' || job.conclusion !== 'success') reason = `Required candidate task is ${job.conclusion ?? job.status}`
      else if (!requiredSteps.every(step => successfulStep(job, step))) reason = 'Required verification step did not succeed'
      let time = job ? executionTime(job) : null
      if (!selection) {
        const declared = compatibleJobs && manifest ? executionTime(manifest) : null
        time = declared ? { start: declared.end ?? declared.start, end: completionBound?.end ?? null } : null
      } else if (!job) {
        const requested = executionTime(selection.job)
        time = requested && requested.end !== null ? { start: requested.end, end: completionBound?.end ?? null } : null
      }
      if (job && candidates.filter(candidate => candidate.attempt === job.attempt).length !== 1
        || !hasCurrentAttempt) time = null
      if (!time) {
        reason ??= 'Candidate task execution chronology is missing or invalid'
        time = compatibleJobs ? completionBound : null
      }
      const attempts = executions.get(id) ?? []
      attempts.push({
        result: { id, status: reason ? 'blocked' : 'passed', reason, runId: run.id, jobId: job?.id ?? null, url: job?.url ?? run.url },
        time,
      })
      executions.set(id, attempts)
    }
  }
  for (const [id, attempts] of executions) results.set(id, latestExecution(attempts))
  const tasks = [...results.values()]
  return {
    status: tasks.every(task => task.status === 'passed') ? 'passed' : 'blocked',
    repository: identity.repository, sha: identity.sha, configuration: identity.configuration, tasks,
  }
}

export function repositoryName(value: string): string {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) throw new Error('Repository must be owner/name')
  return value
}

export function parseGitHubJsonLines(output: string): unknown[] {
  return output.split('\n').filter(line => line.trim()).map((line): unknown => JSON.parse(line))
}

function github(endpoint: string, collection?: string): unknown {
  const args = ['api', endpoint, '-H', 'Accept: application/vnd.github+json']
  if (collection) args.push('--paginate', '--jq', collection === '[]' ? '.[] | @json' : `.${collection}[] | @json`)
  const output = execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return collection ? parseGitHubJsonLines(output) : JSON.parse(output)
}

export function mainCommit(repository: string): string {
  const ref = object(github(`repos/${repository}/git/ref/heads/main`))
  const target = object(ref.object)
  if (ref.ref !== 'refs/heads/main' || target.type !== 'commit') throw new Error('Expected the exact main branch commit')
  return fullSha(string(target.sha))
}

export function assertMainProtection(repository: string): void {
  const applied = github(`repos/${repository}/rules/branches/main?per_page=100`, '[]')
  if (!Array.isArray(applied)) throw new Error('Invalid effective main branch rules')
  const rules = new Set(applied.map(rule => string(object(rule).type)))
  const required = ['pull_request', 'non_fast_forward', 'deletion', 'required_linear_history']
  if (required.every(rule => rules.has(rule))) return
  const classic = object(github(`repos/${repository}/branches/main/protection`))
  if (isObject(classic.required_pull_request_reviews)) rules.add('pull_request')
  if (isObject(classic.allow_force_pushes) && classic.allow_force_pushes.enabled === false) rules.add('non_fast_forward')
  if (isObject(classic.allow_deletions) && classic.allow_deletions.enabled === false) rules.add('deletion')
  if (isObject(classic.required_linear_history) && classic.required_linear_history.enabled === true) rules.add('required_linear_history')
  if (!required.every(rule => rules.has(rule))) throw new Error('Main must require pull requests and linear history, and prevent force updates and deletion')
}

export function assertRawCommit(cwd: string, repository: string, sha: string): void {
  if (spawnSync('git', ['cat-file', '-e', sha], { cwd, stdio: 'ignore' }).status !== 0) {
    execFileSync('git', ['fetch', '--no-tags', `https://github.com/${repository}.git`, sha], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  }
  const type = execFileSync('git', ['cat-file', '-t', sha], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  if (type !== 'commit') throw new Error('Candidate and main must be exact Git commit objects')
  const body = execFileSync('git', ['cat-file', 'commit', sha], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  if (createHash('sha1').update(`commit ${body.length}\0`).update(body).digest('hex') !== sha) {
    throw new Error('Git commit object does not match its fixed SHA')
  }
}

export function admitFinalSnapshot(cwd: string, repository: string, sha: string) {
  try {
    const metadata = object(github(`repos/${repository}`))
    const repositoryId = integer(metadata.id)
    if (string(metadata.full_name).toLowerCase() !== repository.toLowerCase() || metadata.default_branch !== 'main') {
      throw new Error('Expected the requested repository and main default branch')
    }
    const main = mainCommit(repository)
    assertMainProtection(repository)
    const associated = github(`repos/${repository}/commits/${sha}/pulls?per_page=100`, '[]')
    if (!Array.isArray(associated)) throw new Error('Invalid associated pull request metadata')
    const integrated = associated.some(entry => {
      const number = integer(object(entry).number)
      const pr = object(github(`repos/${repository}/pulls/${number}`))
      if (pr.number !== number) throw new Error('Pull request identity does not match its endpoint')
      const base = object(pr.base)
      const baseRepository = object(base.repo)
      return pr.state === 'closed' && pr.merged === true && timestamp(pr.merged_at) !== null
        && base.ref === 'main' && baseRepository.id === repositoryId && string(baseRepository.full_name).toLowerCase() === repository.toLowerCase()
        && pr.merge_commit_sha === sha
    })
    if (!integrated) throw new Error('Candidate must be a final merged pull request snapshot on protected main')
    assertRawCommit(cwd, repository, sha)
    assertRawCommit(cwd, repository, main)
    if (spawnSync('git', ['merge-base', '--is-ancestor', sha, main], { cwd, stdio: 'ignore' }).status !== 0) {
      throw new Error('Candidate is not reachable from the explicitly resolved main commit')
    }
    return { repositoryId, main }
  } catch (error) {
    throw new Error(`Candidate is ineligible for formal verification: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}

export const LEGACY_STABLE_CUTOFF = '53b8a0ccf5649ce3bb7084303f0677e46c1d20e7'
export function historicalStableSnapshot(cwd: string, sha: string): boolean {
  fullSha(sha)
  assertRawCommit(cwd, 'titanxxh/open-agricola', LEGACY_STABLE_CUTOFF)
  if (execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd, encoding: 'utf8' }).trim() === 'true') {
    execFileSync('git', ['fetch', '--no-tags', '--unshallow', 'https://github.com/titanxxh/open-agricola.git', LEGACY_STABLE_CUTOFF],
      { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  }
  const result = spawnSync('git', ['merge-base', '--is-ancestor', sha, LEGACY_STABLE_CUTOFF], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  if (result.error) throw result.error
  if (result.status === 0) return true
  if (result.status === 1) return false
  throw new Error(result.stderr.trim() || 'Could not establish historical stable ancestry')
}
export function stableConfiguration(cwd: string, sha: string, producer: string): string {
  return createHash('sha256').update('open-agricola-stable-main-verification-v1\0')
    .update(verificationConfiguration(cwd, sha)).update('\0').update(verificationConfiguration(cwd, producer)).digest('hex')
}

export function checkCandidateVerification(cwd: string, repository: string, sha: string): CandidateVerificationResult {
  repositoryName(repository); fullSha(sha)
  const { repositoryId, main } = admitFinalSnapshot(cwd, repository, sha)
  const workflow = object(github(`repos/${repository}/actions/workflows/candidate-verification.yml`))
  if (workflow.path !== CANDIDATE_WORKFLOW) throw new Error('Unexpected candidate workflow identity')
  const runs = github(`repos/${repository}/actions/workflows/${integer(workflow.id)}/runs?event=workflow_dispatch&per_page=100`, 'workflow_runs')
  if (!Array.isArray(runs)) throw new Error('Invalid GitHub workflow run collection')
  const policy = verificationConfiguration(cwd, main), producers: string[] = []
  const modern: CandidateRunEvidence[] = [], legacy: CandidateRunEvidence[] = []
  let historical: boolean | undefined
  let modernAttempt = false
  for (const value of runs) {
    const run = object(value), producer = fullSha(string(run.head_sha))
    const current = run.head_branch === 'main' && typeof run.display_title === 'string' && run.display_title.startsWith(`stable / ${sha} / `)
    const old = !current && producer === sha && (historical ??= historicalStableSnapshot(cwd, sha))
    if (!old && !current) continue
    if (current) {
      const metadata = parseRun(value)
      if (metadata.repositoryId !== repositoryId || metadata.headRepositoryId !== repositoryId || metadata.workflowId !== integer(workflow.id)
        || metadata.path !== CANDIDATE_WORKFLOW || metadata.event !== 'workflow_dispatch') continue
      assertRawCommit(cwd, repository, producer)
      if (spawnSync('git', ['merge-base', '--is-ancestor', producer, main], { cwd, stdio: 'ignore' }).status !== 0) continue
      modernAttempt = true
      if (verificationConfiguration(cwd, producer) !== policy) continue
      producers.push(producer)
    }
    const metadata = parseRun(value)
    const jobs = github(`repos/${repository}/actions/runs/${metadata.id}/jobs?filter=all&per_page=100`, 'jobs')
    if (!Array.isArray(jobs)) throw new Error('Invalid GitHub job collection')
    if (current) modern.push({ run: value, jobs })
    else legacy.push({ run: value, jobs })
  }
  // A requested modern run cannot be hidden by an older historical success.
  if (!modernAttempt && historical) return evaluateCandidateVerification({ repository, repositoryId, sha,
    configuration: verificationConfiguration(cwd, sha), workflowId: integer(workflow.id), execution: 'legacy-stable' }, legacy)
  return evaluateCandidateVerification({ repository, repositoryId, sha, configuration: stableConfiguration(cwd, sha, main),
    workflowId: integer(workflow.id), channel: 'stable', execution: 'uid-rootless-v1', producerShas: producers }, modern)
}

export function assertCandidateCheckout(cwd: string, sha: string, workflowSha = sha): void {
  fullSha(sha)
  const actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
  if (actual !== sha || process.env.GITHUB_SHA && process.env.GITHUB_SHA !== workflowSha) {
    throw new Error(`Candidate checkout mismatch: expected ${sha}, actual ${actual}, workflow ${process.env.GITHUB_SHA ?? 'local'}`)
  }
  const changes = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd, encoding: 'utf8' }).trim()
  if (changes) throw new Error('Candidate checkout contains uncommitted sources')
}

export function candidateManifest(cwd: string, sha: string, input: string) {
  assertCandidateCheckout(cwd, sha)
  const tasks = selectedTasks(input)
  const configuration = verificationConfiguration(cwd, sha)
  return {
    sha, configuration, matrix: { task: tasks },
    binding: `${sha} / ${configuration} / ${tasks.join(',')}`,
    fullTasks: [...FULL_TASK_IDS],
  }
}

type CommandRunner = (command: string, args: string[], cwd: string) => number
const runCommand: CommandRunner = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, env: process.env, stdio: 'inherit' })
  if (result.error) throw result.error
  return result.status ?? 1
}

export function runCandidateTask(cwd: string, id: string, sha: string, run: CommandRunner = runCommand, workflowSha = sha): void {
  const task = verificationTask(id)
  assertCandidateCheckout(cwd, sha, workflowSha)
  const commands = [
    ...(task.services ? [{ command: process.execPath, args: ['scripts/local-services.mjs', '--test'] }] : []),
    ...taskCommands(cwd, task.id),
  ]
  for (const command of commands) {
    const status = run(command.command, command.args, cwd)
    if (status !== 0) throw new Error(`Candidate task ${id} failed: ${command.command} ${command.args.join(' ')} (${status})`)
  }
  assertCandidateCheckout(cwd, sha, workflowSha)
}

export function requestCandidateVerification(cwd: string, repository: string, sha: string, ref: string, tasks: string) {
  repositoryName(repository)
  fullSha(sha)
  const { main } = admitFinalSnapshot(cwd, repository, sha)
  const configuration = stableConfiguration(cwd, sha, main)
  const selected = selectedTasks(tasks)
  const target = ref === 'main' ? mainCommit(repository) : object(github(`repos/${repository}/commits/${encodeURIComponent(ref)}`)).sha
  if (target !== sha) throw new Error('Dispatch ref no longer points to the fixed candidate SHA')
  const workflow = object(github(`repos/${repository}/actions/workflows/candidate-verification.yml`))
  if (workflow.path !== CANDIDATE_WORKFLOW) throw new Error('Unexpected candidate workflow identity')
  execFileSync('gh', ['api', `repos/${repository}/actions/workflows/${integer(workflow.id)}/dispatches`, '--method', 'POST', '--input', '-'], {
    cwd, encoding: 'utf8', input: JSON.stringify({ ref: 'main', inputs: { candidate_sha: sha, tasks: selected.join(',') } }),
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return { status: 'requested', repository, sha, configuration, tasks: selected }
}

function options(input: string[]) {
  const result = new Map<string, string>()
  for (let index = 0; index < input.length; index++) {
    const key = input[index]
    if (key === '--json') continue
    if (!['--sha', '--repository', '--ref', '--tasks', '--producer', '--candidate-directory'].includes(key) || result.has(key)) throw new Error(`Unexpected candidate option: ${key}`)
    const value = input[++index]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`)
    result.set(key, value)
  }
  return (key: string, fallback?: string): string => {
    const value = result.get(key) ?? fallback
    if (!value) throw new Error(`Missing candidate option ${key}`)
    return value
  }
}

function trustedStableProducer(producer: string): void {
  fullSha(producer)
  assertCandidateCheckout(resolve(import.meta.dirname, '../..'), producer, producer)
  if (process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_WORKFLOW_SHA !== producer
    || process.env.GITHUB_WORKFLOW_REF !== `${process.env.GITHUB_REPOSITORY}/${CANDIDATE_WORKFLOW}@refs/heads/main`) throw new Error('Stable verification must execute its trusted main producer')
}

export function candidateVerificationCli(cwd: string, input: string[]): number {
  const [mode, ...remaining] = input
  const id = mode === 'run-task' || mode === 'formal-run-task' ? remaining.shift() : null
  const option = options(remaining)
  const sha = fullSha(option('--sha'))
  if (mode === 'formal-manifest' || mode === 'formal-source' || mode === 'formal-run-task') {
    const producer = fullSha(option('--producer'))
    trustedStableProducer(producer)
    const candidate = resolve(cwd, option('--candidate-directory'))
    assertCandidateCheckout(candidate, sha, producer)
    if (mode !== 'formal-run-task') {
      const { repositoryId } = admitFinalSnapshot(candidate, option('--repository', process.env.GITHUB_REPOSITORY), sha)
      if (mode === 'formal-source') return 0
      const tasks = selectedTasks(option('--tasks', 'all')), configuration = stableConfiguration(candidate, sha, producer)
      const binding = `${repositoryId} / stable / ${sha} / ${configuration} / ${producer} / ${tasks.join(',')}`
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `sha=${sha}\nproducer=${producer}\nconfiguration=${configuration}\nmatrix=${JSON.stringify({ task: tasks })}\ntasks=${tasks.join(',')}\nbinding=${binding}\n`)
      printVerificationOutput(JSON.stringify({ channel: 'stable', sha, producer, configuration, tasks, binding })); return 0
    }
    if (!id) throw new Error('Missing stable task')
    const execution = candidateExecution(); let sequence = 0
    runCandidateTask(candidate, id, sha, (command, args) => executeCandidate(execution,
      command === 'pnpm' ? resolve(execution.node, '../pnpm') : command, args, `task-${sequence++}`,
      { GAME_BUILD_ID: sha, VERIFICATION_CHANNEL: 'stable', RELEASE_CHANNEL: 'stable' }), producer)
    trustedStableProducer(producer); return 0
  }
  if (mode === 'source') {
    assertCandidateCheckout(cwd, sha)
    printVerificationOutput(JSON.stringify({ status: 'matched', sha }))
    return 0
  }
  if (mode === 'manifest') {
    const manifest = candidateManifest(cwd, sha, option('--tasks', 'all'))
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `sha=${sha}\nconfiguration=${manifest.configuration}\nmatrix=${JSON.stringify(manifest.matrix)}\ntasks=${manifest.matrix.task.join(',')}\nbinding=${manifest.binding}\n`)
    }
    printVerificationOutput(JSON.stringify(manifest))
    return 0
  }
  if (mode === 'run-task' && id) {
    if (process.env.GITHUB_ACTIONS === 'true') {
      const execution = candidateExecution()
      let sequence = 0
      runCandidateTask(cwd, id, sha, (command, args) => executeCandidate(execution,
        command === 'pnpm' ? resolve(execution.node, '../pnpm') : command, args, `task-${sequence++}`,
        { GAME_BUILD_ID: sha, VERIFICATION_CHANNEL: 'stable', RELEASE_CHANNEL: 'stable' }))
    } else runCandidateTask(cwd, id, sha)
    return 0
  }
  if (mode === 'check') {
    const result = checkCandidateVerification(cwd, option('--repository'), sha)
    printVerificationOutput(JSON.stringify(result, null, 2))
    return result.status === 'passed' ? 0 : 1
  }
  if (mode === 'request') {
    printVerificationOutput(JSON.stringify(requestCandidateVerification(cwd, option('--repository'), sha, option('--ref'), option('--tasks', 'all'))))
    return 0
  }
  throw new Error('Usage: candidate-verification.ts manifest|source|run-task|check|request --sha <full SHA> [options]')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = candidateVerificationCli(process.cwd(), process.argv.slice(2)) }
  catch (error) {
    printVerificationOutput(error instanceof Error ? error.message : String(error), 'stderr')
    process.exitCode = 1
  }
}
