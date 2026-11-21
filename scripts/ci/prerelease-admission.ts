import { execFileSync, spawnSync } from 'node:child_process'
import { assertMainProtection, assertRawCommit, mainCommit, parseGitHubJsonLines, repositoryName } from './candidate-admission.ts'
import { prereleaseCandidateRef } from './prerelease-format.ts'
import { commitRef, ensureCommitRef, github, ownerMachine } from './release-github.ts'
import { fullSha } from './verification-tasks.ts'

// Admission of a prerelease candidate: the protected main and prerelease rules, the immutable candidate reference,
// and the integration manifest that ties the candidate to its main baseline. Fixing a candidate reference and the
// owner's controlled main synchronization admit through the same checks.

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

/** Reads every page of a repository endpoint's `collection` (`[]` for a top-level array). */
export const listRepository = (repository: string, endpoint: string, collection = '[]'): unknown[] => parseGitHubJsonLines(execFileSync('gh', [
  'api', `repos/${repository}/${endpoint}`, '-H', 'Accept: application/vnd.github+json', '--paginate', '--jq',
  collection === '[]' ? '.[] | @json' : `.${collection}[] | @json`,
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))

function requireRules(repository: string, branch: string, required: string[]): void {
  const rules = listRepository(repository, `rules/branches/${encodeURIComponent(branch)}?per_page=100`).map(rule => object(rule).type)
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

export function admitPrereleaseSnapshot(cwd: string, repository: string, sha: string) {
  fullSha(sha)
  const source = authority(cwd, repository)
  requireRules(repository, 'prerelease', ['pull_request', 'deletion', 'required_linear_history'])
  assertRawCommit(cwd, repository, sha)
  if (commitRef(repository, `heads/${prereleaseCandidateRef(sha)}`) !== sha) throw new Error('Prerelease candidate lacks its matching immutable reference')
  requireRules(repository, prereleaseCandidateRef(sha), ['non_fast_forward', 'deletion', 'update'])
  const manifest = object(JSON.parse(git(cwd, ['show', `${sha}:prerelease-integration.json`])))
  const baseline = fullSha(text(manifest.baselineMainSha))
  if (!ancestor(cwd, baseline, source.main)) throw new Error('Prerelease baseline is not reachable from protected main')
  validateIntegrationManifest(cwd, repository, sha, baseline)
  return source
}

export function fixPrereleaseCandidate(cwd: string, repository: string, sha: string, options: { allowEarlierBaseline?: boolean } = {}) {
  ownerMachine()
  fullSha(sha)
  const source = authority(cwd, repository)
  const existing = commitRef(repository, `heads/${prereleaseCandidateRef(sha)}`)
  if (existing !== null) return admitPrereleaseSnapshot(cwd, repository, sha)
  requireRules(repository, 'prerelease', ['pull_request', 'deletion', 'required_linear_history'])
  if (commitRef(repository, 'heads/prerelease') !== sha) throw new Error('Selected prerelease ref changed before candidate fixation')
  const baseline = options.allowEarlierBaseline
    ? fullSha(text(object(JSON.parse(git(cwd, ['show', `${sha}:prerelease-integration.json`]))).baselineMainSha))
    : source.main
  if (!ancestor(cwd, baseline, source.main)) throw new Error('Prerelease baseline is outside protected main')
  validateIntegrationManifest(cwd, repository, sha, baseline)
  ensureCommitRef(repository, `heads/${prereleaseCandidateRef(sha)}`, sha)
  return admitPrereleaseSnapshot(cwd, repository, sha)
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
