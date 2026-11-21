import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fullSha } from './verification-tasks.ts'

// Admission of a stable candidate: the repository, protected main and the raw Git objects a candidate must be
// reachable through before any evidence about it counts.

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
const timestamp = (value: unknown): number | null => {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

export function repositoryName(value: string): string {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) throw new Error('Repository must be owner/name')
  return value
}

export function parseGitHubJsonLines(output: string): unknown[] {
  return output.split('\n').filter(line => line.trim()).map((line): unknown => JSON.parse(line))
}

/** Reads one GitHub API endpoint, or every page of `collection` (`[]` for a top-level array) as one list. */
export function readGitHub(endpoint: string, collection?: string): unknown {
  const args = ['api', endpoint, '-H', 'Accept: application/vnd.github+json']
  if (collection) args.push('--paginate', '--jq', collection === '[]' ? '.[] | @json' : `.${collection}[] | @json`)
  const output = execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return collection ? parseGitHubJsonLines(output) : JSON.parse(output)
}

export function mainCommit(repository: string): string {
  const ref = object(readGitHub(`repos/${repository}/git/ref/heads/main`))
  const target = object(ref.object)
  if (ref.ref !== 'refs/heads/main' || target.type !== 'commit') throw new Error('Expected the exact main branch commit')
  return fullSha(string(target.sha))
}

export function assertMainProtection(repository: string): void {
  const applied = readGitHub(`repos/${repository}/rules/branches/main?per_page=100`, '[]')
  if (!Array.isArray(applied)) throw new Error('Invalid effective main branch rules')
  const rules = new Set(applied.map(rule => string(object(rule).type)))
  const required = ['pull_request', 'non_fast_forward', 'deletion', 'required_linear_history']
  if (required.every(rule => rules.has(rule))) return
  const classic = object(readGitHub(`repos/${repository}/branches/main/protection`))
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

function completeCommitAncestry(cwd: string, repository: string, sha: string): void {
  assertRawCommit(cwd, repository, sha)
  if (execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd, encoding: 'utf8' }).trim() === 'true') {
    execFileSync('git', ['fetch', '--no-tags', '--unshallow', `https://github.com/${repository}.git`, sha],
      { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  }
}

export function admitFinalSnapshot(cwd: string, repository: string, sha: string) {
  try {
    const metadata = object(readGitHub(`repos/${repository}`))
    const repositoryId = integer(metadata.id)
    if (string(metadata.full_name).toLowerCase() !== repository.toLowerCase() || metadata.default_branch !== 'main') {
      throw new Error('Expected the requested repository and main default branch')
    }
    const main = mainCommit(repository)
    assertMainProtection(repository)
    const associated = readGitHub(`repos/${repository}/commits/${sha}/pulls?per_page=100`, '[]')
    if (!Array.isArray(associated)) throw new Error('Invalid associated pull request metadata')
    const integrated = associated.some(entry => {
      const number = integer(object(entry).number)
      const pr = object(readGitHub(`repos/${repository}/pulls/${number}`))
      if (pr.number !== number) throw new Error('Pull request identity does not match its endpoint')
      const base = object(pr.base)
      const baseRepository = object(base.repo)
      return pr.state === 'closed' && pr.merged === true && timestamp(pr.merged_at) !== null
        && base.ref === 'main' && baseRepository.id === repositoryId && string(baseRepository.full_name).toLowerCase() === repository.toLowerCase()
        && pr.merge_commit_sha === sha
    })
    if (!integrated) throw new Error('Candidate must be a final merged pull request snapshot on protected main')
    assertRawCommit(cwd, repository, sha)
    completeCommitAncestry(cwd, repository, main)
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
  completeCommitAncestry(cwd, 'titanxxh/open-agricola', LEGACY_STABLE_CUTOFF)
  const result = spawnSync('git', ['merge-base', '--is-ancestor', sha, LEGACY_STABLE_CUTOFF], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  if (result.error) throw result.error
  if (result.status === 0) return true
  if (result.status === 1) return false
  throw new Error(result.stderr.trim() || 'Could not establish historical stable ancestry')
}
