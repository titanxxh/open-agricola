import { execFileSync, spawnSync } from 'node:child_process'
import { candidateExecution, executeCandidate } from './candidate-isolation.ts'
import { createHash } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertCandidateCheckout, assertMainProtection, assertRawCommit, evaluateCandidateVerification, mainCommit, parseGitHubJsonLines, PRERELEASE_CANDIDATE_WORKFLOW, repositoryName, runCandidateTask } from './candidate-verification.ts'
import { fullSha, selectedTasks, verificationConfiguration } from './verification-tasks.ts'
import { commitRef, ensureCommitRef, github, ownerMachine } from '../release/candidate.ts'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const object = (value: unknown): Record<string, unknown> => {
  if (!isObject(value)) throw new Error('Expected prerelease metadata object')
  return value
}
const text = (value: unknown): string => {
  if (typeof value !== 'string' || !value) throw new Error('Expected prerelease metadata string')
  return value
}
const git = (cwd: string, args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const ancestor = (cwd: string, before: string, after: string): boolean => spawnSync('git', ['merge-base', '--is-ancestor', before, after], { cwd, stdio: 'ignore' }).status === 0
const list = (repository: string, endpoint: string, collection = '[]'): unknown[] => parseGitHubJsonLines(execFileSync('gh', [
  'api', `repos/${repository}/${endpoint}`, '-H', 'Accept: application/vnd.github+json', '--paginate', '--jq',
  collection === '[]' ? '.[] | @json' : `.${collection}[] | @json`,
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))

export const prereleaseCandidateRef = (sha: string): string => `verification/prerelease/${fullSha(sha)}`

function requireRules(repository: string, branch: string, required: string[]): void {
  const rules = list(repository, `rules/branches/${encodeURIComponent(branch)}?per_page=100`).map(rule => object(rule).type)
  if (!required.every(rule => rules.includes(rule))) throw new Error(`Missing prerelease reference protection for ${branch}: ${required.join(',')}`)
}

export function validateIntegrationManifest(cwd: string, repository: string, sha: string, main: string) {
  assertRawCommit(cwd, repository, sha)
  assertRawCommit(cwd, repository, main)
  const manifest = object(JSON.parse(git(cwd, ['show', `${fullSha(sha)}:prerelease-integration.json`])))
  if (manifest.format !== 1 || manifest.repository !== repository || manifest.baselineMainSha !== main
    || !ancestor(cwd, main, sha)) throw new Error('Prerelease integration baseline must match the selected main SHA')
  if (git(cwd, ['rev-list', '--merges', `${main}..${sha}`])) throw new Error('Prerelease integration must have linear history')
  if (!Array.isArray(manifest.features)) throw new Error('Prerelease integration must identify its feature sources')
  const features = manifest.features.map(value => {
    const feature = object(value)
    const id = text(feature.id)
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || !Array.isArray(feature.dependsOn)) throw new Error('Invalid integration feature')
    const dependsOn = feature.dependsOn.map(text)
    const sourceSha = fullSha(text(feature.sourceSha))
    const integratedSha = fullSha(text(feature.integratedSha))
    assertRawCommit(cwd, repository, sourceSha)
    assertRawCommit(cwd, repository, integratedSha)
    if (!ancestor(cwd, main, integratedSha) || !ancestor(cwd, integratedSha, sha)) throw new Error('Feature integration commit is outside the candidate')
    return { id, dependsOn, sourceSha, integratedSha }
  })
  const ids = new Set(features.map(feature => feature.id))
  if (ids.size !== features.length || features.some(feature => feature.dependsOn.some(id => !ids.has(id)))) throw new Error('Invalid integration dependency')
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error('Cyclic integration dependency')
    if (visited.has(id)) return
    visiting.add(id)
    for (const dependency of features.find(feature => feature.id === id)?.dependsOn ?? []) visit(dependency)
    visiting.delete(id); visited.add(id)
  }
  for (const id of ids) visit(id)
  return { format: 1, repository, baselineMainSha: main, features }
}

function authority(cwd: string, repository: string) {
  repositoryName(repository)
  const metadata = object(github(repository, ''))
  if (text(metadata.full_name).toLowerCase() !== repository.toLowerCase() || metadata.default_branch !== 'main'
    || typeof metadata.id !== 'number' || !Number.isSafeInteger(metadata.id) || metadata.id < 1) throw new Error('Invalid prerelease repository identity')
  const main = mainCommit(repository)
  assertMainProtection(repository)
  assertRawCommit(cwd, repository, main)
  return { repositoryId: metadata.id, main }
}

function fixedSnapshot(cwd: string, repository: string, sha: string) {
  fullSha(sha)
  const source = authority(cwd, repository)
  assertRawCommit(cwd, repository, sha)
  if (commitRef(repository, `heads/${prereleaseCandidateRef(sha)}`) !== sha) throw new Error('Prerelease candidate lacks its matching immutable reference')
  requireRules(repository, prereleaseCandidateRef(sha), ['non_fast_forward', 'deletion', 'update'])
  const manifest = object(JSON.parse(git(cwd, ['show', `${sha}:prerelease-integration.json`])))
  const baseline = fullSha(text(manifest.baselineMainSha))
  if (!ancestor(cwd, baseline, source.main)) throw new Error('Prerelease baseline is not reachable from protected main')
  validateIntegrationManifest(cwd, repository, sha, baseline)
  return source
}

export function fixPrereleaseCandidate(cwd: string, repository: string, sha: string): void {
  ownerMachine()
  fullSha(sha)
  const source = authority(cwd, repository)
  const existing = commitRef(repository, `heads/${prereleaseCandidateRef(sha)}`)
  if (existing !== null) { fixedSnapshot(cwd, repository, sha); return }
  requireRules(repository, 'prerelease', ['pull_request', 'deletion', 'required_linear_history'])
  if (commitRef(repository, 'heads/prerelease') !== sha) throw new Error('Selected prerelease ref changed before candidate fixation')
  validateIntegrationManifest(cwd, repository, sha, source.main)
  ensureCommitRef(repository, `heads/${prereleaseCandidateRef(sha)}`, sha)
  fixedSnapshot(cwd, repository, sha)
}

export function prereleaseConfiguration(cwd: string, sha: string, producer: string): string {
  return createHash('sha256').update('open-agricola-prerelease-verification-v1\0')
    .update(verificationConfiguration(cwd, sha)).update('\0').update(verificationConfiguration(cwd, producer)).digest('hex')
}

export function checkPrereleaseVerification(cwd: string, repository: string, sha: string) {
  const source = fixedSnapshot(cwd, repository, sha)
  const workflow = object(github(repository, 'actions/workflows/prerelease-candidate-verification.yml'))
  if (workflow.path !== PRERELEASE_CANDIDATE_WORKFLOW || typeof workflow.id !== 'number') throw new Error('Unexpected prerelease producer workflow')
  const policyConfiguration = verificationConfiguration(cwd, source.main)
  const runs = list(repository, `actions/workflows/${workflow.id}/runs?event=workflow_dispatch&per_page=100`, 'workflow_runs')
  const evidence = []
  const producerShas: string[] = []
  for (const value of runs) {
    const run = object(value)
    if (run.head_branch !== 'main' || typeof run.display_title !== 'string' || !run.display_title.startsWith(`prerelease / ${sha} / `)) continue
    const producer = fullSha(text(run.head_sha))
    assertRawCommit(cwd, repository, producer)
    if (!ancestor(cwd, producer, source.main) || verificationConfiguration(cwd, producer) !== policyConfiguration) continue
    producerShas.push(producer)
    if (typeof run.id !== 'number' || !Number.isSafeInteger(run.id) || run.id < 1) throw new Error('Invalid prerelease run identity')
    const jobs = list(repository, `actions/runs/${run.id}/jobs?filter=all&per_page=100`, 'jobs')
    evidence.push({ run: value, jobs })
  }
  return { ...evaluateCandidateVerification({ repository, repositoryId: source.repositoryId, sha,
    configuration: prereleaseConfiguration(cwd, sha, source.main), workflowId: workflow.id, channel: 'prerelease', producerShas, execution: 'uid-rootless-v1',
  }, evidence), channel: 'prerelease' as const, producerConfiguration: policyConfiguration }
}

export function requestPrereleaseVerification(cwd: string, repository: string, sha: string, tasks: string) {
  fixedSnapshot(cwd, repository, sha)
  const selected = selectedTasks(tasks)
  const workflow = object(github(repository, 'actions/workflows/prerelease-candidate-verification.yml'))
  if (workflow.path !== PRERELEASE_CANDIDATE_WORKFLOW || typeof workflow.id !== 'number') throw new Error('Unexpected prerelease producer workflow')
  execFileSync('gh', ['api', `repos/${repository}/actions/workflows/${workflow.id}/dispatches`, '--method', 'POST', '--input', '-'], {
    cwd, encoding: 'utf8', input: JSON.stringify({ ref: 'main', inputs: { candidate_sha: sha, candidate_ref: prereleaseCandidateRef(sha), tasks: selected.join(',') } }),
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return { status: 'requested', channel: 'prerelease', repository, sha, tasks: selected }
}

export function syncPrerelease(cwd: string, repository: string, sha: string, expectedOld: string, main: string) {
  ownerMachine()
  fullSha(expectedOld); fullSha(main); fullSha(sha)
  const source = authority(cwd, repository)
  if (source.main !== main) throw new Error('Main changed before prerelease synchronization')
  if (commitRef(repository, 'heads/prerelease') !== expectedOld) throw new Error('Prerelease lease conflict: remote head changed')
  requireRules(repository, 'prerelease', ['pull_request', 'deletion', 'required_linear_history'])
  const previous = object(JSON.parse(git(cwd, ['show', `${expectedOld}:prerelease-integration.json`])))
  const previousBase = fullSha(text(previous.baselineMainSha))
  if (previousBase === main || !ancestor(cwd, previousBase, main)) throw new Error('Controlled synchronization requires main to advance from the prior integration baseline')
  const oldManifest = validateIntegrationManifest(cwd, repository, expectedOld, previousBase)
  const nextManifest = validateIntegrationManifest(cwd, repository, sha, main)
  const sources = (features: typeof oldManifest.features) => features.map(({ id, dependsOn, sourceSha }) => ({ id, dependsOn: [...dependsOn].sort(), sourceSha })).sort((a, b) => a.id.localeCompare(b.id))
  if (JSON.stringify(sources(oldManifest.features)) !== JSON.stringify(sources(nextManifest.features))) throw new Error('Main synchronization cannot add or remove feature sources; use a reviewed PR')
  execFileSync('git', ['push', `--force-with-lease=refs/heads/prerelease:${expectedOld}`, `https://github.com/${repository}.git`, `${sha}:refs/heads/prerelease`], {
    cwd, stdio: ['ignore', 'pipe', 'pipe'],
  })
  return { status: 'synchronized', channel: 'prerelease', repository, previousSha: expectedOld, sha, baselineMainSha: main, features: nextManifest.features }
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
        { GAME_BUILD_ID: sha, VERIFICATION_CHANNEL: 'prerelease', RELEASE_CHANNEL: productionBuild ? 'prerelease' : 'stable' })
    }
    const result = spawnSync(command, productionBuild ? ['run', 'build:hosted-frontend'] : argv, { cwd: directory, env, stdio: 'inherit' })
    if (result.error) throw result.error
    return result.status ?? 1
  }, producer)
}

function trustedProducer(producer: string): void {
  fullSha(producer)
  const policy = resolve(import.meta.dirname, '../..')
  assertCandidateCheckout(policy, producer, producer)
  if (process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_WORKFLOW_SHA !== producer
    || process.env.GITHUB_WORKFLOW_REF !== `${process.env.GITHUB_REPOSITORY}/${PRERELEASE_CANDIDATE_WORKFLOW}@refs/heads/main`) {
    throw new Error('Prerelease verification must execute the trusted main producer')
  }
}

export function prereleaseVerificationCli(cwd: string, input: string[]): number {
  const [mode, ...rest] = input
  const args = new Map<string, string>()
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i]; const value = rest[++i]
    if (!['--sha', '--repository', '--tasks', '--producer', '--candidate-directory', '--ref', '--expected-old', '--main-sha', '--task'].includes(key)
      || args.has(key) || !value || value.startsWith('--')) throw new Error('Invalid prerelease verification options')
    args.set(key, value)
  }
  const option = (key: string, fallback?: string): string => { const value = args.get(key) ?? fallback; if (!value) throw new Error(`Missing ${key}`); return value }
  const sha = fullSha(option('--sha'))
  const repository = option('--repository', process.env.GITHUB_REPOSITORY)
  if (mode === 'select') { fixPrereleaseCandidate(cwd, repository, sha); return 0 }
  if (mode === 'sync') { console.log(JSON.stringify(syncPrerelease(cwd, repository, sha, option('--expected-old'), option('--main-sha')))); return 0 }
  if (mode === 'check') { const result = checkPrereleaseVerification(cwd, repository, sha); console.log(JSON.stringify(result)); return result.status === 'passed' ? 0 : 1 }
  if (mode === 'request') { console.log(JSON.stringify(requestPrereleaseVerification(cwd, repository, sha, option('--tasks', 'all')))); return 0 }
  const producer = fullSha(option('--producer'))
  trustedProducer(producer)
  const candidate = resolve(cwd, option('--candidate-directory'))
  assertCandidateCheckout(candidate, sha, producer)
  if (mode === 'manifest') {
    const source = fixedSnapshot(candidate, repository, sha)
    if (option('--ref') !== prereleaseCandidateRef(sha)) throw new Error('Wrong immutable prerelease candidate ref')
    const tasks = selectedTasks(option('--tasks', 'all'))
    const configuration = prereleaseConfiguration(candidate, sha, producer)
    const binding = `${source.repositoryId} / prerelease / ${sha} / ${configuration} / ${producer} / ${tasks.join(',')}`
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `sha=${sha}\nconfiguration=${configuration}\nmatrix=${JSON.stringify({ task: tasks })}\ntasks=${tasks.join(',')}\nbinding=${binding}\n`)
    console.log(JSON.stringify({ channel: 'prerelease', sha, producer, configuration, tasks, binding }))
    return 0
  }
  if (mode === 'source') return 0
  if (mode === 'run-task') {
    runPrereleaseCandidateTask(candidate, option('--task'), sha, producer)
    trustedProducer(producer)
    return 0
  }
  throw new Error('Usage: prerelease-verification.ts select|check|request|sync|manifest|source|run-task --sha <SHA> [options]')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = prereleaseVerificationCli(process.cwd(), process.argv.slice(2)) }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 }
}
