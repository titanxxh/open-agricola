import { createHash } from 'node:crypto'
import type { OwnerLocalProof } from './owner-local-format.ts'
import { verificationConfiguration, verificationTask, type FullTaskId } from './verification-tasks.ts'

// The native GitHub evidence contract of candidate verification: workflow paths, run, job and step names, the
// configuration hash bound into them, and the shape of a verification result. Execution writes these names and
// acceptance reads them, so both take them from here.

export const CANDIDATE_WORKFLOW = '.github/workflows/candidate-verification.yml'
export const PRERELEASE_CANDIDATE_WORKFLOW = '.github/workflows/prerelease-candidate-verification.yml'
export const CANDIDATE_MANIFEST_JOB = 'candidate-manifest'
export const CANDIDATE_MANIFEST_STEP = 'Generate candidate manifest'
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
  ownerLocal?: OwnerLocalProof
}

export function stableConfiguration(cwd: string, sha: string, producer: string): string {
  return createHash('sha256').update('open-agricola-stable-main-verification-v1\0')
    .update(verificationConfiguration(cwd, sha)).update('\0').update(verificationConfiguration(cwd, producer)).digest('hex')
}

/** The manifest step name a formal stable run binds its candidate, configuration, producer and task selection with. */
export const stableManifestBinding = (repositoryId: number, sha: string, configuration: string, producer: string, tasks: readonly string[]): string =>
  `${repositoryId} / stable / ${sha} / ${configuration} / ${producer} / ${tasks.join(',')}`

/** The manifest step name prefix that precedes the selected task list for `identity` under `producerSha`. */
export function manifestBindingPrefix(identity: CandidateIdentity, producerSha: string): string {
  return identity.channel === 'prerelease'
    ? `Prerelease manifest / ${identity.repositoryId} / prerelease / ${identity.sha} / ${identity.configuration} / ${producerSha} / `
    : identity.execution === 'legacy-stable' ? `Candidate manifest / ${identity.sha} / ${identity.configuration} / `
      : `Stable manifest / ${identity.repositoryId} / stable / ${identity.sha} / ${identity.configuration} / ${producerSha} / `
}

export const candidateTaskJob = (id: FullTaskId, configuration: string): string => `candidate / ${id} / ${configuration}`

/** The steps a successful task job must show for its execution contract. */
export function requiredTaskSteps(identity: CandidateIdentity, id: FullTaskId): string[] {
  const steps = ['Checkout candidate', 'Install dependencies', 'Verify candidate checkout', 'Execute verification task']
  if (identity.channel === 'prerelease' || identity.execution === 'uid-rootless-v1') steps.push(
    'Prepare candidate isolation', 'Prove native candidate isolation', 'Stop candidate descendants and collect private diagnostics')
  if (verificationTask(id).browser) steps.push('Install browsers')
  return steps
}
