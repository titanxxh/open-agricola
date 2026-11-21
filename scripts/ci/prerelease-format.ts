import { createHash } from 'node:crypto'
import { fullSha, verificationConfiguration } from './verification-tasks.ts'

// The prerelease evidence contract: the immutable candidate reference, the configuration pair hash and the manifest
// binding a prerelease run names its candidate, producer and task selection with.

export const prereleaseCandidateRef = (sha: string): string => `verification/prerelease/${fullSha(sha)}`

export const prereleaseConfigurationPair = (candidate: string, producer: string): string => createHash('sha256').update('open-agricola-prerelease-verification-v1\0')
  .update(candidate).update('\0').update(producer).digest('hex')

export function prereleaseConfiguration(cwd: string, sha: string, producer: string): string {
  return prereleaseConfigurationPair(verificationConfiguration(cwd, sha), verificationConfiguration(cwd, producer))
}

export const prereleaseManifestBinding = (repositoryId: number, sha: string, configuration: string, producer: string, tasks: readonly string[]): string =>
  `${repositoryId} / prerelease / ${sha} / ${configuration} / ${producer} / ${tasks.join(',')}`
