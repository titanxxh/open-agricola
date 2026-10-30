import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertCandidateCheckout, checkCandidateVerification, repositoryName } from './candidate-verification'
import { fullSha } from './verification-tasks'

export function buildVerifiedPages(cwd: string, repository: string, sha: string): void {
  repositoryName(repository)
  fullSha(sha)
  assertCandidateCheckout(cwd, sha)
  const verification = checkCandidateVerification(cwd, repository, sha)
  if (verification.status !== 'passed') {
    const reasons = verification.tasks.filter(task => task.status !== 'passed').map(task => `${task.id}: ${task.reason}`)
    throw new Error(`Pages deployment blocked for ${sha}: ${reasons.join('; ')}`)
  }
  assertCandidateCheckout(cwd, sha)
  rmSync(join(cwd, 'dist-pages'), { recursive: true, force: true })
  const build = spawnSync('pnpm', ['run', 'build:pages-frontend'], {
    cwd, stdio: 'inherit', env: { ...process.env, GAME_BUILD_ID: sha },
  })
  if (build.error) throw build.error
  if (build.status !== 0) throw new Error(`Pages build failed (${build.status ?? 'terminated'})`)
  assertCandidateCheckout(cwd, sha)
  const artifact: unknown = JSON.parse(readFileSync(join(cwd, 'dist-pages/frontend-build.json'), 'utf8'))
  if (typeof artifact !== 'object' || artifact === null
    || !('format' in artifact) || artifact.format !== 1
    || !('gameBuildId' in artifact) || artifact.gameBuildId !== sha
    || !('basePath' in artifact) || artifact.basePath !== '/') {
    throw new Error('Pages artifact does not match the verified candidate')
  }
}

export function pagesDeploymentCli(cwd: string, input: string[]): void {
  const [mode, ...args] = input
  const options = new Map<string, string>()
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]
    const value = args[index + 1]
    if (!['--repository', '--sha'].includes(key) || options.has(key) || !value || value.startsWith('--')) {
      throw new Error('Usage: pages-deployment.ts build --sha <full SHA> --repository <owner/name>')
    }
    options.set(key, value)
  }
  const sha = options.get('--sha')
  const repository = options.get('--repository')
  if (mode !== 'build' || !sha || !repository) {
    throw new Error('Usage: pages-deployment.ts build --sha <full SHA> --repository <owner/name>')
  }
  buildVerifiedPages(cwd, repository, sha)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { pagesDeploymentCli(process.cwd(), process.argv.slice(2)) }
  catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
