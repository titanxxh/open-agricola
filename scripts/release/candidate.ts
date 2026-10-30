import { execFileSync, spawnSync } from 'node:child_process'
import { fullSha } from '../ci/verification-tasks'
import { repositoryName } from '../ci/candidate-verification'

export const RELEASE_REPOSITORY = 'titanxxh/open-agricola'

export function ownerMachine(): void {
  if ([process.env.CI, process.env.GITHUB_ACTIONS].some(value => value && value !== 'false')) {
    throw new Error('Release and backend deployment must run on an owner-controlled machine, outside CI')
  }
}

export function github(repository: string, endpoint: string, body?: unknown): unknown {
  repositoryName(repository)
  const args = ['api', `repos/${repository}/${endpoint}`, '-H', 'Accept: application/vnd.github+json']
  if (body !== undefined) args.push('--method', 'POST', '--input', '-')
  const result = spawnSync('gh', args, {
    encoding: 'utf8', input: body === undefined ? undefined : JSON.stringify(body),
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(result.stderr.trim() || `GitHub request failed: ${endpoint}`)
  return result.stdout.trim() ? JSON.parse(result.stdout) : null
}

export function optionalGithub(repository: string, endpoint: string): unknown {
  try { return github(repository, endpoint) }
  catch (error) {
    if (error instanceof Error && /\(HTTP 404\)/.test(error.message)) return null
    throw error
  }
}

function referenceCommit(repository: string, value: unknown): string {
  if (typeof value !== 'object' || !value || !('object' in value)) throw new Error('Expected a GitHub reference')
  let target: unknown = value.object
  for (let depth = 0; depth < 10; depth++) {
    if (typeof target !== 'object' || !target || !('type' in target) || !('sha' in target) || typeof target.sha !== 'string') {
      throw new Error('Expected a GitHub commit or annotated tag')
    }
    const sha = fullSha(target.sha)
    if (target.type === 'commit') return sha
    if (target.type !== 'tag') throw new Error('GitHub reference does not resolve to a commit')
    const tag = github(repository, `git/tags/${sha}`)
    if (typeof tag !== 'object' || !tag || !('object' in tag)) throw new Error('Invalid annotated GitHub tag')
    target = tag.object
  }
  throw new Error('Annotated GitHub tag chain is too deep')
}

export function commitRef(repository: string, ref: string): string | null {
  const value = optionalGithub(repository, `git/ref/${ref.split('/').map(encodeURIComponent).join('/')}`)
  return value === null ? null : referenceCommit(repository, value)
}

export function ensureCommitRef(repository: string, ref: string, sha: string): void {
  const endpoint = `git/ref/${ref.split('/').map(encodeURIComponent).join('/')}`
  const existing = optionalGithub(repository, endpoint)
  if (existing) {
    if (referenceCommit(repository, existing) !== sha) throw new Error(`Existing ${ref} points to a different SHA`)
    return
  }
  try { github(repository, 'git/refs', { ref: `refs/${ref}`, sha }) }
  catch (error) {
    const created = optionalGithub(repository, endpoint)
    if (!created) throw error
    if (referenceCommit(repository, created) !== sha) throw new Error(`Existing ${ref} points to a different SHA`, { cause: error })
    return
  }
  if (referenceCommit(repository, github(repository, endpoint)) !== sha) throw new Error(`Created ${ref} does not match the fixed candidate SHA`)
}

export function candidateSha(cwd: string, repository: string, ref: string): string {
  const main = ref === 'main' ? github(repository, 'git/ref/heads/main') : null
  if (main !== null && (typeof main !== 'object' || !('ref' in main) || main.ref !== 'refs/heads/main')) {
    throw new Error('GitHub did not resolve the exact main branch')
  }
  const commit = main === null ? github(repository, `commits/${encodeURIComponent(ref)}`) : { sha: referenceCommit(repository, main) }
  if (typeof commit !== 'object' || !commit || !('sha' in commit) || typeof commit.sha !== 'string') {
    throw new Error('GitHub did not resolve the candidate commit')
  }
  const sha = fullSha(commit.sha)
  const available = spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd, stdio: 'ignore' })
  if (available.status !== 0) {
    execFileSync('git', ['fetch', '--no-tags', `https://github.com/${repository}.git`, sha], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  }
  const actual = execFileSync('git', ['rev-parse', '--verify', `${sha}^{commit}`], { cwd, encoding: 'utf8' }).trim()
  if (actual !== sha) throw new Error('Fetched candidate does not match the fixed SHA')
  return sha
}
