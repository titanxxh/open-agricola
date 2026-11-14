import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { canonicalOwnerLocalCommands, type OwnerLocalReceipt } from '../ci/owner-local-verification'
import { FULL_TASK_IDS, verificationConfiguration } from '../ci/verification-tasks'
import { finalSnapshotMetadata } from './_helpers/candidate-provenance'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const tsx = join(repositoryRoot, 'node_modules/.bin/tsx')
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

type Actor = { id: number; login: string; type: string }
type Asset = { id: number; name: string; size: number; state: string; uploader: Actor; browser_download_url: string; created_at: string }
type NativeRelease = { id: number; tag_name: string; target_commitish: string; html_url: string; prerelease: boolean; draft: boolean;
  author: Actor; assets: Asset[]; body: string; created_at: string; published_at: string | null }
type Status = { id: number; context: string; state: string; creator: Actor; target_url: string; description: string; created_at: string }
type FixtureState = { sha: string; version: string; owner: Actor; user: Actor; refs: Record<string, string>; release: NativeRelease | null;
  assetBytes: string; statuses: Status[]; dropStatus: boolean; foreignStatus: boolean; foreignAsset: boolean; hideDraftByTag: boolean;
  wrongStatusField: 'target' | 'digest' | null; moveTagAfterStatus: boolean; preserveDraftAssetUrlOnPublish: boolean;
  releaseTime: string; assetTime: string; statusTime: string; publishedTime: string; provenance: Record<string, unknown> }
type Event = { endpoint: string; method: string; body?: { context?: string; state?: string; draft?: boolean; sha?: string } }

function fixture(rebound = false, channel: 'stable' | 'prerelease' = 'stable') {
  const root = mkdtempSync(join(tmpdir(), 'oa-release-owner-local-')); roots.push(root)
  mkdirSync(join(root, 'scripts'), { recursive: true }); mkdirSync(join(root, '.github/workflows'), { recursive: true })
  cpSync(join(repositoryRoot, 'scripts/ci'), join(root, 'scripts/ci'), { recursive: true })
  cpSync(join(repositoryRoot, 'scripts/release'), join(root, 'scripts/release'), { recursive: true })
  cpSync(join(repositoryRoot, '.github/workflows/candidate-verification.yml'), join(root, '.github/workflows/candidate-verification.yml'))
  mkdirSync(join(root, 'e2e-tests'))
  for (const name of ['a', 'b', 'c', 'd']) writeFileSync(join(root, 'e2e-tests', `${name}.spec.ts`), '')
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { release: 'tsx scripts/release/publish.ts', 'check:architecture': 'pnpm run lint' } }))
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
  writeFileSync(join(root, '.gitignore'), 'bin/\npolicy/\nstate.json\nevents.jsonl\nreceipt.json\n')
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-b', 'main'); git('config', 'user.name', 'Local Verification Test'); git('config', 'user.email', 'local@example.test')
  git('add', '--all', '--', '.', ':(exclude)docs/superpowers/**'); git('commit', '-m', 'local verification fixture')
  const mainSha = git('rev-parse', 'HEAD')
  if (channel === 'prerelease') {
    writeFileSync(join(root, 'feature.txt'), 'private candidate source')
    git('add', 'feature.txt'); git('commit', '-m', 'independent feature')
    const featureSha = git('rev-parse', 'HEAD')
    writeFileSync(join(root, 'prerelease-integration.json'), JSON.stringify({ format: 1, repository: 'titanxxh/open-agricola',
      baselineMainSha: mainSha, features: [{ id: 'identity', dependsOn: [], sourceSha: featureSha, integratedSha: featureSha }] }))
    git('add', 'prerelease-integration.json'); git('commit', '-m', 'fixed integration manifest')
  }
  const testedSha = git('rev-parse', 'HEAD')
  if (rebound) git('commit', '--allow-empty', '-m', 'final integration with identical source')
  const sha = git('rev-parse', 'HEAD'), tree = git('rev-parse', `${sha}^{tree}`)
  const baseTime = Date.now() - 300_000
  const at = (seconds: number) => new Date(baseTime + seconds * 1000).toISOString()
  const commands = canonicalOwnerLocalCommands(root, testedSha)
  const receipt: OwnerLocalReceipt = { format: 1, kind: 'owner-local-verification', repository: 'titanxxh/open-agricola', repositoryId: 123,
    testedSha, candidateSha: testedSha, tree, configuration: verificationConfiguration(root, testedSha), producerConfiguration: verificationConfiguration(root, sha),
    startedAt: at(0), completedAt: at(60), environment: { node: 'v24.15.0', platform: 'linux', arch: 'arm64', nodeExecutable: process.execPath },
    tasks: FULL_TASK_IDS.map(id => ({ id, startedAt: at(0), completedAt: at(60), commands: commands[id].map(command => ({ ...command, exitCode: 0, logSha256: 'a'.repeat(64) })) })) }
  const preCommands = Object.fromEntries(Object.entries(commands).map(([id, rows]) => [id, rows.map(command =>
    command.command === 'pnpm' && command.args.join(',') === 'run,build' ? { command: 'pnpm', args: ['run', 'build:hosted-frontend'] } : command)]))
  const localReceipt = channel === 'stable' ? receipt : { ...receipt, kind: 'owner-local-prerelease-verification', channel,
    producerSha: mainSha, tasks: receipt.tasks.map(task => ({ ...task,
      commands: preCommands[task.id].map(command => ({ ...command, exitCode: 0, logSha256: 'a'.repeat(64) })) })) }
  const receiptPath = join(root, 'receipt.json'); writeFileSync(receiptPath, JSON.stringify(localReceipt) + '\n')
  const owner: Actor = { id: 7, login: 'titanxxh', type: 'User' }
  const policy = channel === 'stable' ? root : join(root, 'policy')
  if (channel === 'prerelease') git('worktree', 'add', '--detach', policy, mainSha)
  const version = channel === 'stable' ? 'v9.9.9' : 'v9.9.9-beta.1'
  const state: FixtureState = { sha, version, owner, user: owner, refs: {}, release: null, assetBytes: '', statuses: [], dropStatus: false, foreignStatus: false, foreignAsset: false, hideDraftByTag: false,
    wrongStatusField: null, moveTagAfterStatus: false, preserveDraftAssetUrlOnPublish: false,
    releaseTime: at(61), assetTime: at(62), statusTime: at(63), publishedTime: at(64),
    provenance: { ...finalSnapshotMetadata(sha, channel === 'stable' ? sha : mainSha, { id: 123, full_name: 'titanxxh/open-agricola' }),
      'repos/titanxxh/open-agricola/git/ref/heads/prerelease': { ref: 'refs/heads/prerelease', object: { type: 'commit', sha } },
      'repos/titanxxh/open-agricola/rules/branches/prerelease?per_page=100': ['pull_request', 'deletion', 'required_linear_history'].map(type => ({ type })),
      [`repos/titanxxh/open-agricola/rules/branches/verification%2Fprerelease%2F${sha}?per_page=100`]: ['non_fast_forward', 'deletion', 'update'].map(type => ({ type })),
    } }
  const save = () => writeFileSync(join(root, 'state.json'), JSON.stringify(state))
  const load = (): FixtureState => JSON.parse(readFileSync(join(root, 'state.json'), 'utf8'))
  save()
  const bin = join(root, 'bin'); mkdirSync(bin)
  writeFileSync(join(bin, 'gh'), `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.OWNER_LOCAL_TEST_ROOT;
const file = path.join(root, 'state.json');
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
const endpoint = args[1];
const selected = args.indexOf('--method');
const method = selected < 0 ? 'GET' : args[selected + 1];
const save = () => fs.writeFileSync(file, JSON.stringify(state));
const output = value => process.stdout.write(JSON.stringify(value) + '\\n');
const absent = () => { console.error('gh: Not Found (HTTP 404)'); process.exit(1); };
const event = body => fs.appendFileSync(path.join(root, 'events.jsonl'), JSON.stringify({ endpoint, method, ...(body ? { body } : {}) }) + '\\n');
const prefix = 'repos/titanxxh/open-agricola';
if (method === 'POST' && endpoint.startsWith('https://uploads.github.com/')) {
  event();
  state.assetBytes = fs.readFileSync(args[args.indexOf('--input') + 1], 'utf8');
  state.release.assets.push({ id: 12, name: 'owner-local-verification.json', size: Buffer.byteLength(state.assetBytes), state: 'uploaded',
    uploader: state.foreignAsset ? { id: 8, login: 'collaborator', type: 'User' } : state.owner,
    browser_download_url: 'https://github.com/titanxxh/open-agricola/releases/download/untagged-0123456789abcdef0123/owner-local-verification.json', created_at: state.assetTime });
  save(); output(state.release.assets[0]); process.exit(0);
}
if (method !== 'GET') {
  const body = JSON.parse(fs.readFileSync(0, 'utf8')); event(body);
  if (endpoint === prefix + '/releases/generate-notes') { output({ body: 'Fixture generated release notes', name: 'v9.9.9' }); process.exit(0); }
  else if (endpoint === prefix + '/git/refs') state.refs[body.ref.replace('refs/', '')] = body.sha;
  else if (endpoint === prefix + '/releases') state.release = { ...body, id: 11, author: state.owner, assets: [], created_at: state.releaseTime,
    published_at: null, html_url: 'https://github.com/titanxxh/open-agricola/releases/tag/untagged-0123456789abcdef0123' };
  else if (endpoint === prefix + '/statuses/' + state.sha) {
    if (!state.dropStatus) state.statuses.unshift({ ...body, id: 20 + state.statuses.length, created_at: state.statusTime,
      creator: state.foreignStatus ? { id: 8, login: 'collaborator', type: 'User' } : state.owner,
      ...(state.wrongStatusField === 'target' ? { target_url: 'https://evil.example/proof.json' } : {}),
      ...(state.wrongStatusField === 'digest' ? { description: 'owner-local sha256:' + 'f'.repeat(64) } : {}) });
    if (state.moveTagAfterStatus) state.refs['tags/' + state.version] = 'f'.repeat(40);
  } else if (endpoint === prefix + '/releases/11' && method === 'PATCH') state.release = { ...state.release, ...body, published_at: state.publishedTime,
    html_url: 'https://github.com/titanxxh/open-agricola/releases/tag/' + state.version, assets: state.release.assets.map(asset => ({ ...asset,
      browser_download_url: state.preserveDraftAssetUrlOnPublish ? asset.browser_download_url : 'https://github.com/titanxxh/open-agricola/releases/download/' + state.version + '/owner-local-verification.json' })) };
  else throw Error('Unexpected mutation: ' + endpoint);
  save(); output(state.release ?? {}); process.exit(0);
}
event();
if (endpoint === 'user') output(state.user);
else if (endpoint === prefix) output({ id: 123, full_name: 'titanxxh/open-agricola', default_branch: 'main', owner: state.owner });
else if (endpoint === prefix + '/commits/' + state.sha) output({ sha: state.sha });
else if (endpoint === prefix + '/commits/' + state.sha + '/statuses?per_page=100') state.statuses.forEach(output);
else if (endpoint === prefix + '/releases?per_page=100') { if (state.release) output(state.release); }
else if (endpoint === prefix + '/releases/11') { if (!state.release) absent(); output(state.release); }
else if (endpoint === prefix + '/releases/assets/12') process.stdout.write(state.assetBytes);
else if (endpoint.startsWith(prefix + '/releases/tags/')) { if (!state.release || state.hideDraftByTag && state.release.draft) absent(); output(state.release); }
else if (endpoint.startsWith(prefix + '/git/ref/') && Object.hasOwn(state.refs, endpoint.slice((prefix + '/git/ref/').length))) {
  const tag = endpoint.slice((prefix + '/git/ref/').length); if (!state.refs[tag]) absent();
  output({ ref: 'refs/' + tag, object: { type: 'commit', sha: state.refs[tag] } });
} else if (endpoint.startsWith(prefix + '/git/ref/') && !Object.hasOwn(state.provenance, endpoint)) absent();
else if (endpoint === prefix + '/actions/workflows/candidate-verification.yml') output({ id: 100, path: '.github/workflows/candidate-verification.yml' });
else if (endpoint === prefix + '/actions/workflows/prerelease-candidate-verification.yml') output({ id: 200, path: '.github/workflows/prerelease-candidate-verification.yml' });
else if (endpoint === prefix + '/actions/workflows/100/runs?event=workflow_dispatch&per_page=100' || endpoint === prefix + '/actions/workflows/200/runs?event=workflow_dispatch&per_page=100') {}
else if (Object.hasOwn(state.provenance, endpoint)) {
  const value = state.provenance[endpoint]; if (Array.isArray(value) && args.includes('--paginate')) value.forEach(output); else output(value);
} else throw Error('Unexpected GitHub read: ' + endpoint);
`)
  chmodSync(join(bin, 'gh'), 0o700)
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: [bin, join(repositoryRoot, 'node_modules/.bin'), process.env.PATH].join(delimiter),
    CI: '', GITHUB_ACTIONS: '', GITHUB_SHA: '', GITHUB_OUTPUT: '', OWNER_LOCAL_TEST_ROOT: root }
  const run = (local = true, trusted = true) => spawnSync(tsx, [join(trusted ? policy : root, 'scripts/release/publish.ts'), version, '--channel', channel, '--ref', sha,
    ...(local ? ['--local-verification', receiptPath] : []), '--poll-seconds', '0.01', '--timeout-seconds', '0.05'], { cwd: root, env, encoding: 'utf8', timeout: 30_000 })
  const check = () => spawnSync(tsx, [join(root, channel === 'stable' ? 'scripts/ci/candidate-verification.ts' : 'scripts/ci/prerelease-verification.ts'), 'check', '--repository', 'titanxxh/open-agricola', '--sha', sha], {
    cwd: root, env, encoding: 'utf8', timeout: 30_000,
  })
  const image = () => spawnSync(tsx, ['--eval',
    `import { containerImageVerification } from ${JSON.stringify(join(root, 'scripts/release/container-images.ts'))};
    console.log(JSON.stringify(containerImageVerification({ cwd: ${JSON.stringify(root)}, purpose: 'candidate', sourceSha: ${JSON.stringify(sha)}, producerSha: ${JSON.stringify(mainSha)} })));`],
    { cwd: root, env, encoding: 'utf8', timeout: 30_000 })
  const events = (): Event[] => existsSync(join(root, 'events.jsonl')) ? readFileSync(join(root, 'events.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []
  return { root, sha, mainSha, testedSha, receipt: localReceipt, receiptPath, state, save, load, run, check, image, events }
}

describe('owner-local public release entry', () => {
  it('publishes a fixed full-plan receipt through its draft, asset and owner status without dispatching tests', () => {
    const value = fixture(); value.state.hideDraftByTag = true; value.save()
    const result = value.run()
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ status: 'published', verification: 'owner-local', version: 'v9.9.9', sha: value.sha,
      url: 'https://github.com/titanxxh/open-agricola/releases/tag/v9.9.9' })
    const stored = value.load()
    expect(stored.release).toMatchObject({ draft: false, target_commitish: value.sha, author: { id: 7 } })
    expect(stored.release?.body).toContain('Fixture generated release notes')
    expect(stored.release?.assets).toHaveLength(1)
    expect(JSON.parse(stored.assetBytes)).toMatchObject({ candidateSha: value.sha, testedSha: value.testedSha })
    expect(JSON.parse(stored.assetBytes).tasks.map((task: { id: string }) => task.id)).toEqual(FULL_TASK_IDS)
    expect(stored.refs).toEqual({ 'tags/v9.9.9': value.sha })
    expect(stored.statuses).toHaveLength(1)
    expect(stored.statuses[0]).toMatchObject({ context: 'owner-local-verification', state: 'success', creator: { id: 7 } })
    expect(stored.statuses[0].target_url).toBe('https://github.com/titanxxh/open-agricola/releases/download/v9.9.9/owner-local-verification.json')
    expect(value.events().some(event => event.endpoint.includes('dispatches'))).toBe(false)
    expect(value.events().filter(event => event.method === 'PATCH')).toEqual([expect.objectContaining({ endpoint: 'repos/titanxxh/open-agricola/releases/11', body: { draft: false, make_latest: 'true' } })])
    const check = value.check()
    expect(check.status, check.stderr).toBe(0)
    expect(JSON.parse(check.stdout)).toMatchObject({ status: 'passed', ownerLocal: { kind: 'owner-local', ownerId: 7 } })
    expect(JSON.parse(check.stdout).tasks.every((task: { runId: unknown; jobId: unknown }) => task.runId === null && task.jobId === null)).toBe(true)
  })

  it('rebinds an identical tested tree to the actual final integration SHA', () => {
    const value = fixture(true)
    expect(value.testedSha).not.toBe(value.sha)
    const result = value.run()
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(value.load().assetBytes)).toMatchObject({ testedSha: value.testedSha, candidateSha: value.sha })
  })

  it('keeps its draft unpublished when native authorization is missing, then resumes without replacing the asset', () => {
    const value = fixture(); value.state.dropStatus = true; value.save()
    const failed = value.run()
    expect(failed.status).not.toBe(0)
    expect(failed.stderr).toContain('Native owner-local authorization did not bind the prepared draft')
    const interrupted = value.load()
    expect(interrupted.release?.draft).toBe(true)
    expect(interrupted.release?.assets).toHaveLength(1)
    expect(interrupted.statuses).toEqual([])
    expect(value.events().filter(event => event.method === 'PATCH')).toEqual([])
    interrupted.dropStatus = false; writeFileSync(join(value.root, 'state.json'), JSON.stringify(interrupted))
    const resumed = value.run()
    expect(resumed.status, resumed.stderr).toBe(0)
    expect(value.load().release?.draft).toBe(false)
    expect(value.events().filter(event => event.endpoint === 'repos/titanxxh/open-agricola/releases' && event.method === 'POST')).toHaveLength(1)
    expect(value.events().filter(event => event.endpoint.startsWith('https://uploads.github.com/'))).toHaveLength(1)
  })

  it('refuses local authorization from a collaborator before creating tags, drafts or statuses', () => {
    const value = fixture(); value.state.user = { id: 8, login: 'collaborator', type: 'User' }; value.save()
    const result = value.run()
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Only the native repository owner')
    expect(value.events().filter(event => event.method !== 'GET')).toEqual([])
  })

  it.each(['foreignStatus', 'foreignAsset'] as const)('keeps the draft closed when %s differs from the owner', failure => {
    const value = fixture(); value.state[failure] = true; value.save()
    const result = value.run()
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/owner|Owner/)
    expect(value.load().release?.draft).toBe(true)
    expect(value.events().filter(event => event.method === 'PATCH')).toEqual([])
  })

  it('keeps default publication closed for an existing owner-local draft', () => {
    const value = fixture(); value.state.dropStatus = true; value.save()
    expect(value.run().status).not.toBe(0)
    const before = value.events().filter(event => event.method !== 'GET').length
    const result = value.run(false)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('is a draft')
    expect(value.load().release?.draft).toBe(true)
    expect(value.events().filter(event => event.method !== 'GET')).toHaveLength(before)
  })

  it.each(['wrong origin', 'wrong repository', 'invalid untagged path', 'foreign uploader', 'foreign author', 'changed tag', 'changed bytes', 'changed marker'])('refuses to resume a prepared draft with %s', failure => {
    const value = fixture(); value.state.dropStatus = true; value.save()
    expect(value.run().status).not.toBe(0)
    const interrupted = value.load(), release = interrupted.release
    if (!release || release.assets.length !== 1) throw new Error('Missing prepared draft fixture')
    const asset = release.assets[0]
    if (failure === 'wrong origin') asset.browser_download_url = 'https://evil.example/releases/download/untagged-0123456789abcdef0123/owner-local-verification.json'
    if (failure === 'wrong repository') asset.browser_download_url = 'https://github.com/other/repository/releases/download/untagged-0123456789abcdef0123/owner-local-verification.json'
    if (failure === 'invalid untagged path') asset.browser_download_url = 'https://github.com/titanxxh/open-agricola/releases/download/untagged-anything/owner-local-verification.json'
    if (failure === 'foreign uploader') asset.uploader = { id: 8, login: 'collaborator', type: 'User' }
    if (failure === 'foreign author') release.author = { id: 8, login: 'collaborator', type: 'User' }
    if (failure === 'changed tag') interrupted.refs['tags/v9.9.9'] = 'f'.repeat(40)
    if (failure === 'changed bytes') interrupted.assetBytes += '\n'
    if (failure === 'changed marker') release.body = 'Unrelated draft'
    interrupted.dropStatus = false
    writeFileSync(join(value.root, 'state.json'), JSON.stringify(interrupted))
    const before = value.events().filter(event => event.method !== 'GET').length
    const resumed = value.run()
    expect(resumed.status).not.toBe(0)
    expect(value.load().release?.draft).toBe(true)
    expect(value.events().filter(event => event.method !== 'GET')).toHaveLength(before)
    expect(value.events().filter(event => event.method === 'PATCH')).toEqual([])
  })

  it.each(['target', 'digest'] as const)('keeps a prepared draft closed when native status readback has another %s', field => {
    const value = fixture(); value.state.wrongStatusField = field; value.save()
    const result = value.run()
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Native owner-local authorization did not bind the prepared draft')
    expect(value.load().release?.draft).toBe(true)
    expect(value.events().filter(event => event.method === 'PATCH')).toEqual([])
  })

  it('rechecks the fixed tag after status publication before publishing the release', () => {
    const value = fixture(); value.state.moveTagAfterStatus = true; value.save()
    const result = value.run()
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Owner-local prepared draft identity changed')
    expect(value.load().release?.draft).toBe(true)
    expect(value.events().filter(event => event.method === 'PATCH')).toEqual([])
  })

  it('keeps the unchanged public gate strict if a published asset still exposes its temporary draft URL', () => {
    const value = fixture(); value.state.preserveDraftAssetUrlOnPublish = true; value.save()
    const result = value.run()
    expect(result.status).not.toBe(0)
    expect(value.load().release?.draft).toBe(false)
    expect(result.stderr).toContain('Owner-local receipt asset is missing, unbounded or not uploaded by the owner')
    expect(value.check().status).not.toBe(0)
  })
})


describe('owner-local prerelease publication', () => {
  it('publishes the fixed integration as a native prerelease and exposes a distinct local proof without Actions IDs', () => {
    const value = fixture(false, 'prerelease')
    const result = value.run()
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ status: 'published', channel: 'prerelease', verification: 'owner-local', sha: value.sha })
    expect(value.load().release).toMatchObject({ draft: false, prerelease: true, make_latest: 'false' })
    expect(value.load().refs[`heads/verification/prerelease/${value.sha}`]).toBe(value.sha)
    const checked = value.check()
    expect(checked.status, checked.stderr).toBe(0)
    expect(JSON.parse(checked.stdout)).toMatchObject({ status: 'passed', channel: 'prerelease',
      ownerLocal: { kind: 'owner-local-prerelease', ownerId: 7, assetId: 12 } })
    expect(JSON.parse(checked.stdout).tasks.every((task: { runId: unknown; jobId: unknown }) => task.runId === null && task.jobId === null)).toBe(true)
    expect(value.events().some(event => event.endpoint.includes('dispatches'))).toBe(false)
  })
})


it('carries the authenticated native pre asset proof into candidate image qualification', () => {
  const value = fixture(false, 'prerelease')
  const published = value.run()
  expect(published.status, published.stderr).toBe(0)
  const image = value.image()
  expect(image.status, image.stderr).toBe(0)
  expect(JSON.parse(image.stdout)).toMatchObject({ kind: 'owner-local-prerelease', ownerId: 7, assetId: 12,
    url: 'https://github.com/titanxxh/open-agricola/releases/download/v9.9.9-beta.1/owner-local-verification.json' })
  expect(JSON.parse(image.stdout).tasks).toBeUndefined()
})

describe('owner-local prerelease admission remains source bound', () => {
  it('rejects publishing a fixed candidate after current prerelease protection is withdrawn', () => {
    const value = fixture(false, 'prerelease')
    value.state.refs[`heads/verification/prerelease/${value.sha}`] = value.sha
    value.state.provenance['repos/titanxxh/open-agricola/rules/branches/prerelease?per_page=100'] = []
    value.save()
    const result = value.run()
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Missing prerelease reference protection for prerelease')
    expect(value.load().release).toBeNull()
    expect(value.events().filter(event => event.method !== 'GET')).toEqual([])
  })

  it.each(['stable receipt', 'producer', 'partial tasks', 'stable build', 'configuration', 'pre head', 'fixed ref', 'protections', 'baseline', 'collaborator', 'candidate tools'])('refuses %s before publishing any receipt asset', failure => {
    const value = fixture(false, 'prerelease')
    const receipt = JSON.parse(readFileSync(value.receiptPath, 'utf8'))
    if (failure === 'stable receipt') { delete receipt.channel; delete receipt.producerSha; receipt.kind = 'owner-local-verification' }
    if (failure === 'producer') receipt.producerSha = value.sha
    if (failure === 'partial tasks') receipt.tasks.pop()
    if (failure === 'stable build') receipt.tasks.find((task: { id: string }) => task.id === 'build').commands[0].args = ['run', 'build']
    if (failure === 'configuration') receipt.producerConfiguration = 'f'.repeat(64)
    const prefix = 'repos/titanxxh/open-agricola'
    if (failure === 'pre head') value.state.provenance[`${prefix}/git/ref/heads/prerelease`] = { object: { type: 'commit', sha: value.mainSha } }
    if (failure === 'fixed ref') value.state.refs[`heads/verification/prerelease/${value.sha}`] = value.mainSha
    if (failure === 'protections') value.state.provenance[`${prefix}/rules/branches/verification%2Fprerelease%2F${value.sha}?per_page=100`] = []
    if (failure === 'baseline') value.state.provenance[`${prefix}/git/ref/heads/main`] = { object: { type: 'commit', sha: value.sha } }
    if (failure === 'collaborator') value.state.user = { id: 8, type: 'User', login: 'collaborator' }
    writeFileSync(value.receiptPath, JSON.stringify(receipt)); value.save()
    expect(value.run(true, failure !== 'candidate tools').status).not.toBe(0)
    expect(value.load().release).toBeNull()
    expect(value.events().some(event => event.endpoint.startsWith('https://uploads.github.com/'))).toBe(false)
    expect(value.events().some(event => event.endpoint.includes('/statuses/'))).toBe(false)
  })

  it.each(['pending', 'failure', 'error'])('withdraws pre local authority on the latest native owner %s and uses real native fallback', state => {
    const value = fixture(false, 'prerelease')
    expect(value.run().status).toBe(0)
    const stored = value.load()
    stored.statuses.unshift({ ...stored.statuses[0], id: 999, state })
    writeFileSync(join(value.root, 'state.json'), JSON.stringify(stored))
    const result = value.check()
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ status: 'blocked', channel: 'prerelease' })
    expect(JSON.parse(result.stdout).ownerLocal).toBeUndefined()
    expect(value.events().some(event => event.endpoint.includes('/actions/workflows/200/runs'))).toBe(true)
  })

  it('ignores a foreign latest context but rejects a malformed latest owner success without falling back', () => {
    const value = fixture(false, 'prerelease')
    expect(value.run().status).toBe(0)
    const stored = value.load()
    stored.statuses.unshift({ ...stored.statuses[0], id: 999, state: 'failure', creator: { id: 8, login: 'collaborator', type: 'User' } })
    writeFileSync(join(value.root, 'state.json'), JSON.stringify(stored))
    expect(value.check().status).toBe(0)
    const receipt = JSON.parse(stored.assetBytes); receipt.tasks.pop()
    stored.assetBytes = JSON.stringify(receipt) + '\n'
    if (!stored.release) throw new Error('Missing published fixture')
    stored.release.assets[0].size = Buffer.byteLength(stored.assetBytes)
    stored.statuses[1].description = `owner-local sha256:${createHash('sha256').update(stored.assetBytes).digest('hex')}`
    writeFileSync(join(value.root, 'state.json'), JSON.stringify(stored))
    const count = value.events().length
    const rejected = value.check()
    expect(rejected.status).toBe(1)
    expect(rejected.stderr).toContain('Complete canonical owner-local tasks')
    expect(value.events().slice(count).some(event => event.endpoint.includes('/actions/workflows/200/runs'))).toBe(false)
  })
})


it('retains a recorded protected producer after a compatible native main advance', () => {
  const value = fixture(false, 'prerelease'), policy = join(value.root, 'policy')
  execFileSync('git', ['-c', 'user.name=Producer Test', '-c', 'user.email=producer@example.test', 'commit', '--allow-empty', '-m', 'compatible protected producer'], { cwd: policy, stdio: 'ignore' })
  const advanced = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: policy, encoding: 'utf8' }).trim()
  value.state.provenance['repos/titanxxh/open-agricola/git/ref/heads/main'] = { ref: 'refs/heads/main', object: { type: 'commit', sha: advanced } }
  value.state.refs[`heads/verification/prerelease/${value.sha}`] = value.sha
  value.save()
  const result = value.run()
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(value.load().assetBytes).producerSha).toBe(value.mainSha)
})
