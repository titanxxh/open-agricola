import { execFileSync, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { admitFinalSnapshot, mainCommit, readGitHub, repositoryName } from './candidate-admission.ts'
import { CANDIDATE_WORKFLOW, stableConfiguration } from './candidate-format.ts'
import { candidateExecution, executeCandidate } from './candidate-isolation.ts'
import { chromiumLaneEnvironment, fastWorkerEnvironment, FULL_TASK_IDS, fullSha, selectedTasks, taskCommands, verificationConfiguration, verificationTask } from './verification-tasks.ts'

// Execution of a stable candidate: the fixed checkout, its task commands, the trusted producer that runs them, and the
// dispatch that asks the formal workflow for a run.

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const object = (value: unknown): Record<string, unknown> => {
  if (!isObject(value)) throw new Error('Invalid GitHub evidence object')
  return value
}
const integer = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 1) throw new Error('Invalid GitHub evidence identifier')
  return value
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

export type CommandRunner = (command: string, args: string[], cwd: string) => number
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

/** Runs a rehearsal task: isolated on GitHub Actions, directly on a local checkout. */
export function runRehearsalCandidateTask(cwd: string, id: string, sha: string): void {
  if (process.env.GITHUB_ACTIONS !== 'true') return runCandidateTask(cwd, id, sha)
  const execution = candidateExecution()
  let sequence = 0
  runCandidateTask(cwd, id, sha, (command, args) => executeCandidate(execution,
    command === 'pnpm' ? resolve(execution.node, '../pnpm') : command, args, `task-${sequence++}`,
    { GAME_BUILD_ID: sha, VERIFICATION_CHANNEL: 'stable', RELEASE_CHANNEL: 'stable' }))
}

/** Runs a formal stable task in candidate isolation under the trusted main producer. */
export function runStableCandidateTask(candidate: string, id: string, sha: string, producer: string): void {
  const execution = candidateExecution(); let sequence = 0
  runCandidateTask(candidate, id, sha, (command, args) => executeCandidate(execution,
    command === 'pnpm' ? resolve(execution.node, '../pnpm') : command, args, `task-${sequence++}`,
    { GAME_BUILD_ID: sha, VERIFICATION_CHANNEL: 'stable', RELEASE_CHANNEL: 'stable', ...chromiumLaneEnvironment(id), ...fastWorkerEnvironment(id) }), producer)
}

export function trustedStableProducer(producer: string): void {
  fullSha(producer)
  assertCandidateCheckout(resolve(import.meta.dirname, '../..'), producer, producer)
  if (process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_WORKFLOW_SHA !== producer
    || process.env.GITHUB_WORKFLOW_REF !== `${process.env.GITHUB_REPOSITORY}/${CANDIDATE_WORKFLOW}@refs/heads/main`) throw new Error('Stable verification must execute its trusted main producer')
}

const FIXTURE_PULL_ATTEMPTS = 3
export function pullFixtureImages(execution: ReturnType<typeof candidateExecution>, images: readonly string[]): void {
  for (const [index, image] of images.entries()) {
    for (let attempt = 0; ; attempt++) {
      if (executeCandidate(execution, 'docker', ['pull', '--quiet', image], `fixture-image-${index + 1}${attempt ? `-a${attempt}` : ''}`) === 0) break
      if (attempt + 1 >= FIXTURE_PULL_ATTEMPTS) throw new Error(`Fixture image pull failed: ${image}`)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10_000)
    }
  }
}

export function requestCandidateVerification(cwd: string, repository: string, sha: string, ref: string, tasks: string) {
  repositoryName(repository)
  fullSha(sha)
  const { main } = admitFinalSnapshot(cwd, repository, sha)
  const configuration = stableConfiguration(cwd, sha, main)
  const selected = selectedTasks(tasks)
  const target = ref === 'main' ? mainCommit(repository) : object(readGitHub(`repos/${repository}/commits/${encodeURIComponent(ref)}`)).sha
  if (target !== sha) throw new Error('Dispatch ref no longer points to the fixed candidate SHA')
  const workflow = object(readGitHub(`repos/${repository}/actions/workflows/candidate-verification.yml`))
  if (workflow.path !== CANDIDATE_WORKFLOW) throw new Error('Unexpected candidate workflow identity')
  execFileSync('gh', ['api', `repos/${repository}/actions/workflows/${integer(workflow.id)}/dispatches`, '--method', 'POST', '--input', '-'], {
    cwd, encoding: 'utf8', input: JSON.stringify({ ref: 'main', inputs: { candidate_sha: sha, tasks: selected.join(',') } }),
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return { status: 'requested', repository, sha, configuration, tasks: selected }
}
