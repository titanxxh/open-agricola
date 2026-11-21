import { execFileSync, spawnSync } from 'node:child_process'
import { evaluateCandidateVerification } from './candidate-acceptance.ts'
import { assertRawCommit } from './candidate-admission.ts'
import { PRERELEASE_CANDIDATE_WORKFLOW } from './candidate-format.ts'
import { checkPrereleaseOwnerLocalVerification } from './owner-local-acceptance.ts'
import { admitPrereleaseSnapshot, listRepository as list } from './prerelease-admission.ts'
import { prereleaseConfigurationPair as configurationPair } from './prerelease-format.ts'
import { github } from './release-github.ts'
import { fullSha, FULL_TASK_IDS, verificationConfiguration } from './verification-tasks.ts'

// Acceptance of prerelease candidate evidence: the owner-local receipt, or native runs of the trusted main workflow
// grouped by producer configuration, with installed-candidate continuity and the owner policy producer.

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const object = (value: unknown): Record<string, unknown> => {
  if (!isObject(value)) throw new Error('Expected prerelease metadata object')
  return value
}
const text = (value: unknown): string => {
  if (typeof value !== 'string' || !value) throw new Error('Expected prerelease metadata string')
  return value
}
const ancestor = (cwd: string, before: string, after: string): boolean => spawnSync('git', ['merge-base', '--is-ancestor', before, after], { cwd, stdio: 'ignore' }).status === 0

/**
 * `continuity` reopens an already installed candidate after main changed its verification configuration: complete
 * evidence from any producer reachable from protected main still counts, and the result names the current main
 * configuration it differs from. Only `open`/`verify-open` of the installed build request it; deploy, restore and
 * image production always require the current producer configuration.
 *
 * `producerSha` names the owner's trusted policy commit for a source update. Complete evidence produced under that
 * commit's verification configuration also qualifies, so a later main change to the configuration cannot void the
 * evidence the running policy accepts. The commit must be reachable from protected main.
 */
export type PrereleaseVerificationOptions = { continuity?: boolean; producerSha?: string }

/** The reason a task carries while its run is still executing; callers wait instead of requesting another run. */
export const RUN_IN_PROGRESS = 'Candidate run has not completed'

export function checkPrereleaseVerification(cwd: string, repository: string, sha: string, options: PrereleaseVerificationOptions = {}) {
  const source = admitPrereleaseSnapshot(cwd, repository, sha)
  const policyConfiguration = verificationConfiguration(cwd, source.main)
  const ownerPolicy = options.producerSha === undefined ? null : fullSha(options.producerSha)
  if (ownerPolicy) {
    assertRawCommit(cwd, repository, ownerPolicy)
    if (!ancestor(cwd, ownerPolicy, source.main)) throw new Error('The owner policy commit is not reachable from protected main')
  }
  const ownerConfiguration = ownerPolicy ? verificationConfiguration(cwd, ownerPolicy) : policyConfiguration
  const continuity = (producerConfiguration: string) => producerConfiguration === policyConfiguration ? {} : { continuity: { mainSha: source.main, policyConfiguration } }
  const ownerLocal = checkPrereleaseOwnerLocalVerification({ cwd, repository, repositoryId: source.repositoryId, candidateSha: sha, producerSha: source.main,
    continuity: options.continuity === true,
    read: (endpoint, collection) => {
      const relative = endpoint.slice(`repos/${repository}/`.length)
      return collection ? list(repository, relative) : github(repository, endpoint === `repos/${repository}` ? '' : relative)
    },
    download: endpoint => execFileSync('gh', ['api', endpoint, '-H', 'Accept: application/octet-stream'], { maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }),
  })
  if (ownerLocal) return { status: 'passed' as const, repository, sha, channel: 'prerelease' as const,
    configuration: ownerLocal.configuration, producerConfiguration: ownerLocal.producerConfiguration, ownerLocal, ...continuity(ownerLocal.producerConfiguration),
    tasks: FULL_TASK_IDS.map(id => ({ id, status: 'passed' as const, reason: 'Owner-authorized local prerelease verification', runId: null, jobId: null, url: ownerLocal.url })) }
  const workflow = object(github(repository, 'actions/workflows/prerelease-candidate-verification.yml'))
  if (workflow.path !== PRERELEASE_CANDIDATE_WORKFLOW || typeof workflow.id !== 'number') throw new Error('Unexpected prerelease producer workflow')
  const workflowId = workflow.id
  const runs = list(repository, `actions/workflows/${workflowId}/runs?event=workflow_dispatch&per_page=100`, 'workflow_runs')
  // Evidence is grouped by producer configuration; newest runs come first, so the newest compatible group wins.
  const groups = new Map<string, { producerShas: string[]; evidence: { run: unknown; jobs: unknown[] }[] }>([[policyConfiguration, { producerShas: [], evidence: [] }]])
  for (const value of runs) {
    const run = object(value)
    if (run.head_branch !== 'main' || typeof run.display_title !== 'string' || !run.display_title.startsWith(`prerelease / ${sha} / `)) continue
    const producer = fullSha(text(run.head_sha))
    assertRawCommit(cwd, repository, producer)
    if (!ancestor(cwd, producer, source.main)) continue
    const producerConfiguration = verificationConfiguration(cwd, producer)
    if (producerConfiguration !== policyConfiguration && producerConfiguration !== ownerConfiguration && options.continuity !== true) continue
    if (typeof run.id !== 'number' || !Number.isSafeInteger(run.id) || run.id < 1) throw new Error('Invalid prerelease run identity')
    const group = groups.get(producerConfiguration) ?? { producerShas: [], evidence: [] }
    group.producerShas.push(producer)
    group.evidence.push({ run: value, jobs: list(repository, `actions/runs/${run.id}/jobs?filter=all&per_page=100`, 'jobs') })
    groups.set(producerConfiguration, group)
  }
  const candidateConfiguration = verificationConfiguration(cwd, sha)
  const evaluate = (producerConfiguration: string) => {
    const group = groups.get(producerConfiguration) ?? { producerShas: [], evidence: [] }
    return { ...evaluateCandidateVerification({ repository, repositoryId: source.repositoryId, sha,
      configuration: configurationPair(candidateConfiguration, producerConfiguration), workflowId, channel: 'prerelease',
      producerShas: group.producerShas, execution: 'uid-rootless-v1',
    }, group.evidence), channel: 'prerelease' as const, producerConfiguration, ownerLocal: undefined,
    ...(producerConfiguration === ownerConfiguration ? {} : continuity(producerConfiguration)) }
  }
  const current = evaluate(policyConfiguration)
  if (current.status === 'passed') return current
  if (ownerConfiguration !== policyConfiguration) {
    // Owner-policy evidence is used only when it is complete, or when every unfinished task already has a run in
    // progress, so a waiting caller does not request another. Partial owner evidence falls back to the current
    // configuration, whose missing tasks a caller then requests in full against current main.
    const owner = evaluate(ownerConfiguration)
    if (owner.status === 'passed' || owner.tasks.every(task => task.status === 'passed' || task.reason === RUN_IN_PROGRESS)) return owner
  }
  if (options.continuity !== true) return current
  for (const producerConfiguration of groups.keys()) {
    if (producerConfiguration === policyConfiguration) continue
    const carried = evaluate(producerConfiguration)
    if (carried.status === 'passed') return carried
  }
  return current
}
