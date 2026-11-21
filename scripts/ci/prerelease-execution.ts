import { execFileSync, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { assertCandidateCheckout, runCandidateTask } from './candidate-execution.ts'
import { PRERELEASE_CANDIDATE_WORKFLOW } from './candidate-format.ts'
import { candidateExecution, executeCandidate } from './candidate-isolation.ts'
import { admitPrereleaseSnapshot } from './prerelease-admission.ts'
import { prereleaseCandidateRef } from './prerelease-format.ts'
import { github } from './release-github.ts'
import { chromiumLaneEnvironment, fastWorkerEnvironment, fullSha, selectedTasks } from './verification-tasks.ts'

// Execution of a prerelease candidate: the dispatch of the trusted main workflow, the task runner with prerelease
// build identity and no formal token, and the trusted producer check around it.

const object = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected prerelease metadata object')
  return Object.fromEntries(Object.entries(value))
}

export function requestPrereleaseVerification(cwd: string, repository: string, sha: string, tasks: string) {
  admitPrereleaseSnapshot(cwd, repository, sha)
  const selected = selectedTasks(tasks)
  const workflow = object(github(repository, 'actions/workflows/prerelease-candidate-verification.yml'))
  if (workflow.path !== PRERELEASE_CANDIDATE_WORKFLOW || typeof workflow.id !== 'number') throw new Error('Unexpected prerelease producer workflow')
  execFileSync('gh', ['api', `repos/${repository}/actions/workflows/${workflow.id}/dispatches`, '--method', 'POST', '--input', '-'], {
    cwd, encoding: 'utf8', input: JSON.stringify({ ref: 'main', inputs: { candidate_sha: sha, candidate_ref: prereleaseCandidateRef(sha), tasks: selected.join(',') } }),
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return { status: 'requested', channel: 'prerelease', repository, sha, tasks: selected }
}

export function runPrereleaseCandidateTask(cwd: string, id: string, sha: string, producer: string): void {
  let sequence = 0
  runCandidateTask(cwd, id, sha, (command, argv, directory) => {
    const productionBuild = id === 'build' && command === 'pnpm' && argv.length === 2 && argv[0] === 'run' && argv[1] === 'build'
    const env: NodeJS.ProcessEnv = { ...process.env, GAME_BUILD_ID: sha, VERIFICATION_CHANNEL: 'prerelease',
      RELEASE_CHANNEL: productionBuild ? 'prerelease' : 'stable' }
    delete env.GH_TOKEN; delete env.GITHUB_TOKEN
    if (process.env.GITHUB_ACTIONS === 'true') {
      const execution = candidateExecution()
      return executeCandidate(execution, command === 'pnpm' ? resolve(execution.node, '../pnpm') : command,
        productionBuild ? ['run', 'build:hosted-frontend'] : argv, `task-${sequence++}`,
        { GAME_BUILD_ID: sha, VERIFICATION_CHANNEL: 'prerelease', RELEASE_CHANNEL: productionBuild ? 'prerelease' : 'stable', ...chromiumLaneEnvironment(id), ...fastWorkerEnvironment(id) })
    }
    const result = spawnSync(command, productionBuild ? ['run', 'build:hosted-frontend'] : argv, { cwd: directory, env, stdio: 'inherit' })
    if (result.error) throw result.error
    return result.status ?? 1
  }, producer)
}

export function trustedPrereleaseProducer(producer: string): void {
  fullSha(producer)
  const policy = resolve(import.meta.dirname, '../..')
  assertCandidateCheckout(policy, producer, producer)
  if (process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_WORKFLOW_SHA !== producer
    || process.env.GITHUB_WORKFLOW_REF !== `${process.env.GITHUB_REPOSITORY}/${PRERELEASE_CANDIDATE_WORKFLOW}@refs/heads/main`) {
    throw new Error('Prerelease verification must execute the trusted main producer')
  }
}
