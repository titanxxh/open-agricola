import { execFileSync, spawnSync } from 'node:child_process'
import { admitFinalSnapshot, assertRawCommit, historicalStableSnapshot, readGitHub, repositoryName } from './candidate-admission.ts'
import {
  CANDIDATE_MANIFEST_JOB, CANDIDATE_MANIFEST_STEP, CANDIDATE_WORKFLOW, candidateTaskJob, manifestBindingPrefix, PRERELEASE_CANDIDATE_WORKFLOW,
  requiredTaskSteps, stableConfiguration, type CandidateIdentity, type CandidateRunEvidence, type CandidateTaskResult, type CandidateVerificationResult,
} from './candidate-format.ts'
import { checkOwnerLocalVerification } from './owner-local-acceptance.ts'
import { FULL_TASK_IDS, fullSha, selectedTasks, verificationConfiguration, type FullTaskId } from './verification-tasks.ts'

// Acceptance of stable candidate evidence: the owner-local receipt, or the native runs and jobs of the formal workflow,
// evaluated task by task against the admitted candidate and its producer configuration.

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
  const manifest = newestJob(jobs.filter(job => job.name === CANDIDATE_MANIFEST_JOB))
  if (!manifest || manifest.status !== 'completed' || manifest.conclusion !== 'success'
    || !successfulStep(manifest, CANDIDATE_MANIFEST_STEP)) return null
  const prefix = manifestBindingPrefix(identity, producerSha)
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
    const manifest = newestJob(jobs.filter(job => job.name === CANDIDATE_MANIFEST_JOB))
    for (const id of selection?.tasks ?? FULL_TASK_IDS) {
      const name = candidateTaskJob(id, identity.configuration)
      const candidates = jobs.filter(job => job.name === name)
      const job = newestJob(candidates.filter(candidate => !selection || candidate.attempt >= selection.job.attempt))
      const requiredSteps = requiredTaskSteps(identity, id)
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

export function checkCandidateVerification(cwd: string, repository: string, sha: string, options: { ownerDraftReleaseId?: number } = {}): CandidateVerificationResult {
  repositoryName(repository); fullSha(sha)
  const { repositoryId, main } = admitFinalSnapshot(cwd, repository, sha)
  const ownerLocal = checkOwnerLocalVerification({ cwd, repository, repositoryId, candidateSha: sha, producerSha: main, read: readGitHub,
    download: endpoint => execFileSync('gh', ['api', endpoint, '-H', 'Accept: application/octet-stream'], { maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }),
    draftReleaseId: options.ownerDraftReleaseId })
  if (ownerLocal) return { status: 'passed', repository, sha, configuration: ownerLocal.configuration, ownerLocal,
    tasks: FULL_TASK_IDS.map(id => ({ id, status: 'passed', reason: 'Owner-authorized local candidate verification', runId: null, jobId: null, url: ownerLocal.url })) }
  const workflow = object(readGitHub(`repos/${repository}/actions/workflows/candidate-verification.yml`))
  if (workflow.path !== CANDIDATE_WORKFLOW) throw new Error('Unexpected candidate workflow identity')
  const runs = readGitHub(`repos/${repository}/actions/workflows/${integer(workflow.id)}/runs?event=workflow_dispatch&per_page=100`, 'workflow_runs')
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
    const jobs = readGitHub(`repos/${repository}/actions/runs/${metadata.id}/jobs?filter=all&per_page=100`, 'jobs')
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
