import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FULL_TASK_IDS, fullSha, selectedTasks, taskCommands, verificationConfiguration, verificationTask, type FullTaskId } from './verification-tasks'

export const CANDIDATE_WORKFLOW = '.github/workflows/candidate-verification.yml'
export type CandidateIdentity = { repository: string; sha: string; configuration: string; workflowId: number }
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

function parseRun(value: unknown) {
  const run = object(value)
  const createdAt = Date.parse(string(run.created_at))
  if (!Number.isFinite(createdAt)) throw new Error('Invalid GitHub run creation time')
  return {
    id: integer(run.id), workflowId: integer(run.workflow_id), path: string(run.path), event: string(run.event),
    sha: string(run.head_sha), repository: string(object(run.repository).full_name),
    status: string(run.status), attempt: integer(run.run_attempt), createdAt, url: string(run.html_url),
  }
}

function parseJob(value: unknown) {
  const job = object(value)
  if (job.steps !== undefined && !Array.isArray(job.steps)) throw new Error('Invalid GitHub job steps')
  return {
    id: integer(job.id), runId: integer(job.run_id), name: string(job.name), status: string(job.status), conclusion: conclusion(job.conclusion),
    attempt: integer(job.run_attempt), url: string(job.html_url),
    steps: (job.steps ?? []).map((entry: unknown) => {
      const step = object(entry)
      return { name: string(step.name), status: string(step.status), conclusion: conclusion(step.conclusion) }
    }),
  }
}

type Job = ReturnType<typeof parseJob>
const successfulStep = (job: Job, name: string): boolean =>
  job.steps.filter(step => step.name === name).length === 1
  && job.steps.some(step => step.name === name && step.status === 'completed' && step.conclusion === 'success')
const newestJob = (jobs: Job[]): Job | undefined => [...jobs].sort((a, b) => b.attempt - a.attempt || b.id - a.id)[0]

function manifestSelection(jobs: Job[], identity: CandidateIdentity): FullTaskId[] | null {
  const manifest = newestJob(jobs.filter(job => job.name === 'candidate-manifest'))
  if (!manifest || manifest.status !== 'completed' || manifest.conclusion !== 'success'
    || !successfulStep(manifest, 'Generate candidate manifest')) return null
  const prefix = `Candidate manifest / ${identity.sha} / ${identity.configuration} / `
  const bindings = manifest.steps.filter(step => step.name.startsWith(prefix))
  if (bindings.length !== 1 || !successfulStep(manifest, bindings[0].name)) return null
  try {
    const selection = selectedTasks(bindings[0].name.slice(prefix.length))
    return selection.join(',') === bindings[0].name.slice(prefix.length) ? selection : null
  } catch { return null }
}

export function evaluateCandidateVerification(identity: CandidateIdentity, evidence: readonly CandidateRunEvidence[]): CandidateVerificationResult {
  fullSha(identity.sha)
  if (!/^[a-f0-9]{64}$/.test(identity.configuration)) throw new Error('Invalid verification configuration hash')
  const results = new Map<FullTaskId, CandidateTaskResult>(FULL_TASK_IDS.map(id => [id, {
    id, status: 'blocked', reason: 'No verified task evidence', runId: null, jobId: null, url: null,
  }]))
  const runs = evidence.map(entry => ({ run: parseRun(entry.run), jobs: entry.jobs.map(parseJob) }))
    .filter(({ run }) => run.repository.toLowerCase() === identity.repository.toLowerCase()
      && run.sha === identity.sha && run.workflowId === identity.workflowId
      && run.path === CANDIDATE_WORKFLOW && run.event === 'workflow_dispatch')
    .sort((a, b) => a.run.createdAt - b.run.createdAt || a.run.id - b.run.id)
  for (const { run, jobs } of runs) {
    const compatibleJobs = jobs.every(job => job.runId === run.id && job.attempt <= run.attempt)
    const selection = compatibleJobs ? manifestSelection(jobs, identity) : null
    for (const id of selection ?? FULL_TASK_IDS) {
      const name = `candidate / ${id} / ${identity.configuration}`
      const candidates = jobs.filter(job => job.name === name)
      const job = newestJob(candidates)
      const requiredSteps = ['Checkout candidate', 'Install dependencies', 'Verify candidate checkout', 'Execute verification task']
      if (verificationTask(id).browser) requiredSteps.push('Install browsers')
      let reason: string | null = null
      if (!selection) reason = 'Candidate manifest is missing, unsuccessful or incompatible'
      else if (run.status !== 'completed') reason = 'Candidate run has not completed'
      else if (!job) reason = 'Required candidate task was not run'
      else if (candidates.filter(candidate => candidate.attempt === job.attempt).length !== 1) reason = 'Duplicate required candidate task'
      else if (job.status !== 'completed' || job.conclusion !== 'success') reason = `Required candidate task is ${job.conclusion ?? job.status}`
      else if (!requiredSteps.every(step => successfulStep(job, step))) reason = 'Required verification step did not succeed'
      results.set(id, { id, status: reason ? 'blocked' : 'passed', reason, runId: run.id, jobId: job?.id ?? null, url: job?.url ?? run.url })
    }
  }
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
  if (collection) args.push('--paginate', '--jq', `.${collection}[] | @json`)
  const output = execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return collection ? parseGitHubJsonLines(output) : JSON.parse(output)
}

export function checkCandidateVerification(cwd: string, repository: string, sha: string): CandidateVerificationResult {
  repositoryName(repository)
  fullSha(sha)
  const configuration = verificationConfiguration(cwd, sha)
  const workflow = object(github(`repos/${repository}/actions/workflows/candidate-verification.yml`))
  if (workflow.path !== CANDIDATE_WORKFLOW) throw new Error('Unexpected candidate workflow identity')
  const runs = github(`repos/${repository}/actions/workflows/${integer(workflow.id)}/runs?head_sha=${sha}&event=workflow_dispatch&per_page=100`, 'workflow_runs')
  if (!Array.isArray(runs)) throw new Error('Invalid GitHub workflow run collection')
  const evidence = runs.map((run): CandidateRunEvidence => {
    const metadata = parseRun(run)
    const jobs = github(`repos/${repository}/actions/runs/${metadata.id}/jobs?filter=all&per_page=100`, 'jobs')
    if (!Array.isArray(jobs)) throw new Error('Invalid GitHub job collection')
    return { run, jobs }
  })
  return evaluateCandidateVerification({ repository, sha, configuration, workflowId: integer(workflow.id) }, evidence)
}

export function assertCandidateCheckout(cwd: string, sha: string): void {
  fullSha(sha)
  const actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
  if (actual !== sha || process.env.GITHUB_SHA && process.env.GITHUB_SHA !== sha) {
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

export function runCandidateTask(cwd: string, id: string, sha: string, run: CommandRunner = runCommand): void {
  const task = verificationTask(id)
  assertCandidateCheckout(cwd, sha)
  const commands = [
    ...(task.services ? [{ command: process.execPath, args: ['scripts/local-services.mjs', '--test'] }] : []),
    ...taskCommands(cwd, task.id),
  ]
  for (const command of commands) {
    const status = run(command.command, command.args, cwd)
    if (status !== 0) throw new Error(`Candidate task ${id} failed: ${command.command} ${command.args.join(' ')} (${status})`)
  }
  assertCandidateCheckout(cwd, sha)
}

export function requestCandidateVerification(cwd: string, repository: string, sha: string, ref: string, tasks: string) {
  repositoryName(repository)
  fullSha(sha)
  const configuration = verificationConfiguration(cwd, sha)
  const selected = selectedTasks(tasks)
  const commit = object(github(`repos/${repository}/commits/${encodeURIComponent(ref)}`))
  if (commit.sha !== sha) throw new Error('Dispatch ref no longer points to the fixed candidate SHA')
  const workflow = object(github(`repos/${repository}/actions/workflows/candidate-verification.yml`))
  if (workflow.path !== CANDIDATE_WORKFLOW) throw new Error('Unexpected candidate workflow identity')
  execFileSync('gh', ['api', `repos/${repository}/actions/workflows/${integer(workflow.id)}/dispatches`, '--method', 'POST', '--input', '-'], {
    cwd, encoding: 'utf8', input: JSON.stringify({ ref, inputs: { candidate_sha: sha, tasks: selected.join(',') } }),
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return { status: 'requested', repository, sha, configuration, tasks: selected }
}

function options(input: string[]) {
  const result = new Map<string, string>()
  for (let index = 0; index < input.length; index++) {
    const key = input[index]
    if (key === '--json') continue
    if (!['--sha', '--repository', '--ref', '--tasks'].includes(key) || result.has(key)) throw new Error(`Unexpected candidate option: ${key}`)
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

export function candidateVerificationCli(cwd: string, input: string[]): number {
  const [mode, ...remaining] = input
  const id = mode === 'run-task' ? remaining.shift() : null
  const option = options(remaining)
  const sha = fullSha(option('--sha'))
  if (mode === 'source') {
    assertCandidateCheckout(cwd, sha)
    console.log(JSON.stringify({ status: 'matched', sha }))
    return 0
  }
  if (mode === 'manifest') {
    const manifest = candidateManifest(cwd, sha, option('--tasks', 'all'))
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `sha=${sha}\nconfiguration=${manifest.configuration}\nmatrix=${JSON.stringify(manifest.matrix)}\ntasks=${manifest.matrix.task.join(',')}\nbinding=${manifest.binding}\n`)
    }
    console.log(JSON.stringify(manifest))
    return 0
  }
  if (mode === 'run-task' && id) {
    runCandidateTask(cwd, id, sha)
    return 0
  }
  if (mode === 'check') {
    const result = checkCandidateVerification(cwd, option('--repository'), sha)
    console.log(JSON.stringify(result, null, 2))
    return result.status === 'passed' ? 0 : 1
  }
  if (mode === 'request') {
    console.log(JSON.stringify(requestCandidateVerification(cwd, option('--repository'), sha, option('--ref'), option('--tasks', 'all'))))
    return 0
  }
  throw new Error('Usage: candidate-verification.ts manifest|source|run-task|check|request --sha <full SHA> [options]')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = candidateVerificationCli(process.cwd(), process.argv.slice(2)) }
  catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
