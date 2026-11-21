import { execFileSync, spawnSync } from 'node:child_process'
import { fullSha } from '../ci/verification-tasks.ts'
import { github, referenceCommit } from '../ci/release-github.ts'

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
