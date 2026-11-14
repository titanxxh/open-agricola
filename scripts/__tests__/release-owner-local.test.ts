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
type FixtureState = { sha: string; owner: Actor; user: Actor; refs: Record<string, string>; release: NativeRelease | null;
  assetBytes: string; statuses: Status[]; dropStatus: boolean; foreignStatus: boolean; foreignAsset: boolean; hideDraftByTag: boolean;
  releaseTime: string; assetTime: string; statusTime: string; publishedTime: string; provenance: Record<string, unknown> }
type Event = { endpoint: string; method: string; body?: { context?: string; state?: string; draft?: boolean; sha?: string } }

function fixture(rebound = false) {
  const root = mkdtempSync(join(tmpdir(), 'oa-release-owner-local-')); roots.push(root)
  mkdirSync(join(root, 'scripts'), { recursive: true }); mkdirSync(join(root, '.github/workflows'), { recursive: true })
  cpSync(join(repositoryRoot, 'scripts/ci'), join(root, 'scripts/ci'), { recursive: true })
  cpSync(join(repositoryRoot, 'scripts/release'), join(root, 'scripts/release'), { recursive: true })
  cpSync(join(repositoryRoot, '.github/workflows/candidate-verification.yml'), join(root, '.github/workflows/candidate-verification.yml'))
  mkdirSync(join(root, 'e2e-tests'))
  for (const name of ['a', 'b', 'c', 'd']) writeFileSync(join(root, 'e2e-tests', `${name}.spec.ts`), '')
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { release: 'tsx scripts/release/publish.ts', 'check:architecture': 'pnpm run lint' } }))
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
  writeFileSync(join(root, '.gitignore'), 'bin/\nstate.json\nevents.jsonl\nreceipt.json\n')
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-b', 'main'); git('config', 'user.name', 'Local Verification Test'); git('config', 'user.email', 'local@example.test')
  git('add', '--all', '--', '.', ':(exclude)docs/superpowers/**'); git('commit', '-m', 'local verification fixture')
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
  const receiptPath = join(root, 'receipt.json'); writeFileSync(receiptPath, JSON.stringify(receipt) + '\n')
  const owner: Actor = { id: 7, login: 'titanxxh', type: 'User' }
  const state: FixtureState = { sha, owner, user: owner, refs: {}, release: null, assetBytes: '', statuses: [], dropStatus: false, foreignStatus: false, foreignAsset: false, hideDraftByTag: false,
    releaseTime: at(61), assetTime: at(62), statusTime: at(63), publishedTime: at(64),
    provenance: finalSnapshotMetadata(sha, sha, { id: 123, full_name: 'titanxxh/open-agricola' }) }
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
    browser_download_url: 'https://github.com/titanxxh/open-agricola/releases/download/v9.9.9/owner-local-verification.json', created_at: state.assetTime });
  save(); output(state.release.assets[0]); process.exit(0);
}
if (method !== 'GET') {
  const body = JSON.parse(fs.readFileSync(0, 'utf8')); event(body);
  if (endpoint === prefix + '/releases/generate-notes') { output({ body: 'Fixture generated release notes', name: 'v9.9.9' }); process.exit(0); }
  else if (endpoint === prefix + '/git/refs') state.refs[body.ref.replace('refs/', '')] = body.sha;
  else if (endpoint === prefix + '/releases') state.release = { ...body, id: 11, author: state.owner, assets: [], created_at: state.releaseTime,
    published_at: null, html_url: 'https://github.com/titanxxh/open-agricola/releases/tag/v9.9.9' };
  else if (endpoint === prefix + '/statuses/' + state.sha) {
    if (!state.dropStatus) state.statuses.unshift({ ...body, id: 20 + state.statuses.length, created_at: state.statusTime,
      creator: state.foreignStatus ? { id: 8, login: 'collaborator', type: 'User' } : state.owner });
  } else if (endpoint === prefix + '/releases/11' && method === 'PATCH') state.release = { ...state.release, ...body, published_at: state.publishedTime };
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
else if (endpoint.startsWith(prefix + '/git/ref/tags/')) {
  const tag = endpoint.slice((prefix + '/git/ref/').length); if (!state.refs[tag]) absent();
  output({ ref: 'refs/' + tag, object: { type: 'commit', sha: state.refs[tag] } });
} else if (endpoint === prefix + '/actions/workflows/candidate-verification.yml') output({ id: 100, path: '.github/workflows/candidate-verification.yml' });
else if (endpoint === prefix + '/actions/workflows/100/runs?event=workflow_dispatch&per_page=100') {}
else if (Object.hasOwn(state.provenance, endpoint)) {
  const value = state.provenance[endpoint]; if (Array.isArray(value) && args.includes('--paginate')) value.forEach(output); else output(value);
} else throw Error('Unexpected GitHub read: ' + endpoint);
`)
  chmodSync(join(bin, 'gh'), 0o700)
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: [bin, join(repositoryRoot, 'node_modules/.bin'), process.env.PATH].join(delimiter),
    CI: '', GITHUB_ACTIONS: '', GITHUB_SHA: '', GITHUB_OUTPUT: '', OWNER_LOCAL_TEST_ROOT: root }
  const run = (local = true) => spawnSync(tsx, [join(root, 'scripts/release/publish.ts'), 'v9.9.9', '--ref', sha,
    ...(local ? ['--local-verification', receiptPath] : []), '--poll-seconds', '0.01', '--timeout-seconds', '0.05'], { cwd: root, env, encoding: 'utf8', timeout: 30_000 })
  const check = () => spawnSync(tsx, [join(root, 'scripts/ci/candidate-verification.ts'), 'check', '--repository', 'titanxxh/open-agricola', '--sha', sha], {
    cwd: root, env, encoding: 'utf8', timeout: 30_000,
  })
  const events = (): Event[] => existsSync(join(root, 'events.jsonl')) ? readFileSync(join(root, 'events.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []
  return { root, sha, testedSha, receipt, receiptPath, state, save, load, run, check, events }
}

describe('owner-local public release entry', () => {
  it('publishes a fixed full-plan receipt through its draft, asset and owner status without dispatching tests', () => {
    const value = fixture(); value.state.hideDraftByTag = true; value.save()
    const result = value.run()
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ status: 'published', verification: 'owner-local', version: 'v9.9.9', sha: value.sha })
    const stored = value.load()
    expect(stored.release).toMatchObject({ draft: false, target_commitish: value.sha, author: { id: 7 } })
    expect(stored.release?.body).toContain('Fixture generated release notes')
    expect(stored.release?.assets).toHaveLength(1)
    expect(JSON.parse(stored.assetBytes)).toMatchObject({ candidateSha: value.sha, testedSha: value.testedSha })
    expect(JSON.parse(stored.assetBytes).tasks.map((task: { id: string }) => task.id)).toEqual(FULL_TASK_IDS)
    expect(stored.refs).toEqual({ 'tags/v9.9.9': value.sha })
    expect(stored.statuses).toHaveLength(1)
    expect(stored.statuses[0]).toMatchObject({ context: 'owner-local-verification', state: 'success', creator: { id: 7 } })
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
})
