import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkCandidateVerification, parseGitHubJsonLines, repositoryName } from './candidate-verification.ts'
import { fullSha } from './verification-tasks.ts'

const REQUEST_WORKFLOW = '.github/workflows/pages-release-request.yml'
const BROKER_WORKFLOW = '.github/workflows/deploy-pages-broker.yml'
const MAIN_REF = 'refs/heads/main'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function object(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new Error('Invalid Pages GitHub metadata')
  return value
}

function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid Pages GitHub string')
  return value
}

function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error('Invalid Pages GitHub identifier')
  return value
}

function github(repository: string, endpoint: string, collection?: string): unknown {
  const args = ['api', `repos/${repository}/${endpoint}`, '-H', 'Accept: application/vnd.github+json']
  if (collection) args.push('--paginate', '--jq', `.${collection}[] | @json`)
  const output = execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return collection ? parseGitHubJsonLines(output) : JSON.parse(output)
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function assertSourceCheckout(cwd: string, sha: string): void {
  if (git(cwd, ['rev-parse', 'HEAD']) !== sha) throw new Error(`Pages source checkout mismatch: expected ${sha}`)
  if (git(cwd, ['status', '--porcelain', '--untracked-files=all'])) throw new Error('Pages source checkout contains uncommitted sources')
}

function trustedPolicy(cwd: string, repository: string) {
  const sha = fullSha(process.env.GITHUB_SHA ?? '')
  if (process.env.GITHUB_REPOSITORY !== repository || process.env.GITHUB_REF !== MAIN_REF
    || process.env.GITHUB_WORKFLOW_REF !== `${repository}/${BROKER_WORKFLOW}@${MAIN_REF}`
    || process.env.GITHUB_WORKFLOW_SHA !== sha) {
    throw new Error('Pages broker requires its current main workflow and policy source')
  }
  assertSourceCheckout(cwd, sha)
  const event: unknown = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? '', 'utf8'))
  const metadata = object(event)
  const source = object(metadata.repository)
  if (source.full_name !== repository || source.default_branch !== 'main') throw new Error('Pages broker requires the same repository and main default branch')
  return { sha, event: metadata }
}

function releaseRequest(value: unknown, repository: string) {
  const run = object(value)
  if (run.event !== 'release' || run.status !== 'completed' || run.conclusion !== 'success'
    || run.path !== REQUEST_WORKFLOW || object(run.repository).full_name !== repository
    || object(run.head_repository).full_name !== repository) {
    throw new Error('Pages release request must be a successful completed same-repository release workflow')
  }
  return { id: integer(run.id), workflowId: integer(run.workflow_id), attempt: integer(run.run_attempt), sha: fullSha(string(run.head_sha)) }
}

function candidateSha(event: Record<string, unknown>, repository: string): string {
  if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') return fullSha(string(object(event.inputs).candidate_sha))
  if (process.env.GITHUB_EVENT_NAME !== 'workflow_run' || event.action !== 'completed') throw new Error('Unsupported Pages broker event')
  const requested = releaseRequest(event.workflow_run, repository)
  const workflow = object(github(repository, 'actions/workflows/pages-release-request.yml'))
  if (workflow.path !== REQUEST_WORKFLOW || integer(workflow.id) !== requested.workflowId) throw new Error('Unexpected Pages request workflow identity')
  const actual = releaseRequest(github(repository, `actions/runs/${requested.id}`), repository)
  if (actual.id !== requested.id || actual.workflowId !== requested.workflowId
    || actual.attempt !== requested.attempt || actual.sha !== requested.sha) {
    throw new Error('Pages release request does not match trusted GitHub run metadata')
  }
  return requested.sha
}

function assertMainOnlyEnvironment(repository: string): void {
  const environment = object(github(repository, 'environments/github-pages'))
  const policy = object(environment.deployment_branch_policy)
  const allowed = github(repository, 'environments/github-pages/deployment-branch-policies?per_page=100', 'branch_policies')
  if (policy.protected_branches !== false || policy.custom_branch_policies !== true || !Array.isArray(allowed)
    || allowed.length !== 1 || object(allowed[0]).name !== 'main' || object(allowed[0]).type !== 'branch') {
    throw new Error('Pages environment must allow only the main branch; historical tag workflows must remain blocked')
  }
}

function command(cwd: string, args: string[], sha: string): void {
  const env: NodeJS.ProcessEnv = { ...process.env, GAME_BUILD_ID: sha }
  delete env.GH_TOKEN
  delete env.GITHUB_TOKEN
  const result = spawnSync('pnpm', args, { cwd, stdio: 'inherit', env })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Pages ${args[0]} failed (${result.status ?? 'terminated'})`)
}

function assertArtifact(directory: string, sha: string): void {
  const artifact: unknown = JSON.parse(readFileSync(join(directory, 'frontend-build.json'), 'utf8'))
  if (typeof artifact !== 'object' || artifact === null
    || !('format' in artifact) || artifact.format !== 1
    || !('gameBuildId' in artifact) || artifact.gameBuildId !== sha
    || !('basePath' in artifact) || artifact.basePath !== '/') {
    throw new Error('Pages artifact does not match the verified candidate')
  }
}

export function buildVerifiedPages(cwd: string, repository: string): void {
  repositoryName(repository)
  const policy = trustedPolicy(cwd, repository)
  const sha = candidateSha(policy.event, repository)
  assertMainOnlyEnvironment(repository)
  if (spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd, stdio: 'ignore' }).status !== 0) {
    git(cwd, ['fetch', '--no-tags', 'origin', sha])
  }
  if (git(cwd, ['rev-parse', `${sha}^{commit}`]) !== sha) throw new Error('Pages candidate is not the fixed commit')
  const verification = checkCandidateVerification(cwd, repository, sha)
  if (verification.status !== 'passed') {
    const reasons = verification.tasks.filter(task => task.status !== 'passed').map(task => `${task.id}: ${task.reason}`)
    throw new Error(`Pages deployment blocked for ${sha}: ${reasons.join('; ')}`)
  }
  assertSourceCheckout(cwd, policy.sha)
  const candidate = mkdtempSync(join(process.env.RUNNER_TEMP ?? tmpdir(), 'pages-candidate-'))
  try {
    git(cwd, ['worktree', 'add', '--detach', candidate, sha])
    assertSourceCheckout(candidate, sha)
    command(candidate, ['install', '--frozen-lockfile'], sha)
    assertSourceCheckout(candidate, sha)
    rmSync(join(candidate, 'dist-pages'), { recursive: true, force: true })
    command(candidate, ['run', 'build:pages-frontend'], sha)
    assertSourceCheckout(candidate, sha)
    assertSourceCheckout(cwd, policy.sha)
    const artifact = join(candidate, 'dist-pages')
    assertArtifact(artifact, sha)
    const destination = join(cwd, 'dist-pages')
    rmSync(destination, { recursive: true, force: true })
    cpSync(artifact, destination, { recursive: true })
    assertArtifact(destination, sha)
  } finally {
    git(cwd, ['worktree', 'remove', '--force', candidate])
  }
}

export function pagesDeploymentCli(cwd: string, input: string[]): void {
  if (input.length !== 3 || input[0] !== 'build' || input[1] !== '--repository') {
    throw new Error('Usage: pages-deployment.ts build --repository <owner/name>')
  }
  buildVerifiedPages(cwd, input[2])
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { pagesDeploymentCli(process.cwd(), process.argv.slice(2)) }
  catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
