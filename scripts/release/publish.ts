import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout } from 'node:timers/promises'
import { checkCandidateVerification, requestCandidateVerification } from '../ci/candidate-verification'
import { candidateSha, commitRef, ensureCommitRef, optionalGithub, ownerMachine, RELEASE_REPOSITORY } from './candidate'

function releaseOptions(input: string[]) {
  const [version, ...remaining] = input
  if (!version || !/^v\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version)) throw new Error('Release version must be vX.Y.Z')
  const values = new Map<string, string>()
  for (let index = 0; index < remaining.length; index++) {
    const key = remaining[index]
    if (!['--ref', '--repository', '--poll-seconds', '--timeout-seconds'].includes(key) || values.has(key)) throw new Error(`Unexpected release option: ${key}`)
    const value = remaining[++index]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`)
    values.set(key, value)
  }
  const seconds = (key: string, fallback: number) => {
    const value = values.has(key) ? Number(values.get(key)) : fallback
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${key} must be positive seconds`)
    return value * 1000
  }
  return {
    version, repository: values.get('--repository') ?? RELEASE_REPOSITORY, ref: values.get('--ref') ?? 'main',
    pollMs: seconds('--poll-seconds', 15), timeoutMs: seconds('--timeout-seconds', 7200),
  }
}

function existingRelease(repository: string, version: string, sha: string): string | null {
  const tag = commitRef(repository, `tags/${version}`)
  if (tag !== null && tag !== sha) throw new Error(`Existing tag ${version} points to a different SHA`)
  const release = optionalGithub(repository, `releases/tags/${encodeURIComponent(version)}`)
  if (release === null) return null
  if (typeof release !== 'object' || !('tag_name' in release) || release.tag_name !== version
    || !('html_url' in release) || typeof release.html_url !== 'string') throw new Error('Invalid existing GitHub Release')
  if ('draft' in release && release.draft === true) throw new Error(`Existing Release ${version} is a draft; resolve it explicitly`)
  if (tag !== sha) throw new Error(`Existing Release ${version} has no matching candidate tag`)
  return release.html_url
}

export async function publishRelease(cwd: string, input: string[]): Promise<void> {
  ownerMachine()
  const { version, repository, ref, pollMs, timeoutMs } = releaseOptions(input)
  const sha = candidateSha(cwd, repository, ref)
  console.error(`Fixed release candidate: ${sha}. Retry with --ref ${sha} to keep this candidate.`)
  existingRelease(repository, version, sha)
  let result = checkCandidateVerification(cwd, repository, sha)
  if (result.status !== 'passed') {
    const candidateRef = `verification/candidates/${sha}`
    ensureCommitRef(repository, `heads/${candidateRef}`, sha)
    requestCandidateVerification(cwd, repository, sha, candidateRef, result.tasks.filter(task => task.status !== 'passed').map(task => task.id).join(','))
    const deadline = Date.now() + timeoutMs
    for (;;) {
      result = checkCandidateVerification(cwd, repository, sha)
      if (result.status === 'passed') break
      if (Date.now() >= deadline) throw new Error(`Full GitHub verification is incomplete for ${sha}: ${result.tasks.filter(task => task.status !== 'passed').map(task => task.id).join(',')}`)
      await setTimeout(Math.min(pollMs, deadline - Date.now()))
    }
  }
  const existing = existingRelease(repository, version, sha)
  if (existing) {
    console.log(JSON.stringify({ status: 'existing', version, sha, url: existing }))
    return
  }
  ensureCommitRef(repository, `tags/${version}`, sha)
  try {
    execFileSync('gh', ['release', 'create', version, '--repo', repository, '--target', sha, '--verify-tag', '--generate-notes'], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    if (!existingRelease(repository, version, sha)) throw error
  }
  const url = existingRelease(repository, version, sha)
  if (!url) throw new Error('Release creation did not produce a matching published Release')
  console.log(JSON.stringify({ status: 'published', version, sha, url }))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  publishRelease(process.cwd(), process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
