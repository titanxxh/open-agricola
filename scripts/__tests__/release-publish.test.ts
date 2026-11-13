import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { stableConfiguration } from '../ci/candidate-verification'
import { FULL_TASK_IDS, verificationConfiguration } from '../ci/verification-tasks'
import { prereleaseConfiguration } from '../ci/prerelease-verification'
import { finalSnapshotMetadata } from './_helpers/candidate-provenance'

const repository = resolve(import.meta.dirname, '../..')
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

type Evidence = 'passed' | 'missing' | 'failed'
type GitHubState = {
  sha: string
  configuration: string
  preConfiguration: string
  evidence: Evidence
  afterDispatch: Evidence
  mainSha: string
  nextMainSha: string
  provenance: Record<string, unknown>
  moveMain: boolean
  refs: Record<string, { sha: string; type: string }>
  annotatedTags: Record<string, { sha: string; type: string }>
  release: { tag_name: string; html_url: string; prerelease?: boolean; draft?: boolean } | null
}

function fixture(prerelease = false) {
  const root = mkdtempSync(join(tmpdir(), 'oa-release-entry-'))
  roots.push(root)
  mkdirSync(join(root, 'scripts'), { recursive: true })
  mkdirSync(join(root, '.github/workflows'), { recursive: true })
  cpSync(join(repository, 'scripts/ci'), join(root, 'scripts/ci'), { recursive: true })
  cpSync(join(repository, 'scripts/release'), join(root, 'scripts/release'), { recursive: true })
  cpSync(join(repository, '.github/workflows/candidate-verification.yml'), join(root, '.github/workflows/candidate-verification.yml'))
  cpSync(join(repository, 'deploy-backend.sh'), join(root, 'deploy-backend.sh'))
  cpSync(join(repository, 'scripts/image-intake.ts'), join(root, 'scripts/image-intake.ts'))
  for (const name of ['backup-storage.sh', 'backup-process.sh', 'backup-files.mjs']) cpSync(join(repository, 'scripts', name), join(root, 'scripts', name))
  const packageValue: unknown = JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8'))
  if (typeof packageValue !== 'object' || !packageValue || !('scripts' in packageValue)
    || typeof packageValue.scripts !== 'object' || !packageValue.scripts || !('release' in packageValue.scripts)
    || typeof packageValue.scripts.release !== 'string') throw new Error('Missing public release command')
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: {
    release: packageValue.scripts.release, 'check:architecture': 'pnpm run lint',
  } }))
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
  writeFileSync(join(root, '.gitignore'), 'bin/\nstate.json\nevents.jsonl\nremote/\n')
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-b', 'main')
  git('config', 'user.name', 'Release Test')
  git('config', 'user.email', 'release@example.test')
  git('add', '--all', '--', '.', ':(exclude)docs/superpowers/**')
  git('commit', '-m', 'release fixture')
  const mainBase = git('rev-parse', 'HEAD')
  let sha = mainBase
  if (prerelease) {
    writeFileSync(join(root, 'feature.txt'), 'pre feature')
    git('add', '.'); git('commit', '-m', 'pre feature')
    const feature = git('rev-parse', 'HEAD')
    writeFileSync(join(root, 'prerelease-integration.json'), JSON.stringify({ format: 1, repository: 'titanxxh/open-agricola', baselineMainSha: mainBase,
      features: [{ id: 'pre-feature', dependsOn: [], sourceSha: feature, integratedSha: feature }] }))
    git('add', '.'); git('commit', '-m', 'pre integration')
    sha = git('rev-parse', 'HEAD')
  }
  const bin = join(root, 'bin')
  mkdirSync(bin)
  const env: NodeJS.ProcessEnv = {
    ...process.env, CI: '', GITHUB_ACTIONS: '', GITHUB_SHA: '', GITHUB_OUTPUT: '',
    PATH: [bin, join(repository, 'node_modules/.bin'), process.env.PATH].join(delimiter),
    RELEASE_TEST_ROOT: root,
  }
  const invoke = (script: string, args: string[]) => spawnSync(join(repository, 'node_modules/.bin/tsx'), [join(root, script), ...args], {
    cwd: root, env, encoding: 'utf8', timeout: 30_000,
  })
  const manifest = invoke('scripts/ci/candidate-verification.ts', ['manifest', '--sha', sha])
  if (manifest.status !== 0) throw new Error(manifest.stderr)
  const value: unknown = JSON.parse(manifest.stdout)
  if (typeof value !== 'object' || !value || !('configuration' in value) || typeof value.configuration !== 'string') throw new Error('Invalid fixture manifest')
  git('commit', '--allow-empty', '-m', 'later main integration')
  const nextMainSha = git('rev-parse', 'HEAD')
  const state: GitHubState = {
    sha, configuration: stableConfiguration(root, sha, prerelease ? mainBase : sha), preConfiguration: prerelease ? prereleaseConfiguration(root, sha, mainBase) : '', evidence: 'passed', afterDispatch: 'passed',
    mainSha: prerelease ? mainBase : sha, nextMainSha, provenance: finalSnapshotMetadata(sha, prerelease ? mainBase : sha), moveMain: false, refs: {}, annotatedTags: {}, release: null,
  }
  if (prerelease) {
    const prefix = 'repos/titanxxh/open-agricola/'
    state.provenance[prefix + 'git/ref/heads/prerelease'] = { ref: 'refs/heads/prerelease', object: { type: 'commit', sha } }
    state.provenance[prefix + 'rules/branches/prerelease?per_page=100'] = ['pull_request', 'deletion', 'required_linear_history'].map(type => ({ type }))
    state.provenance[prefix + 'rules/branches/' + encodeURIComponent('verification/prerelease/' + sha) + '?per_page=100'] = ['non_fast_forward', 'deletion', 'update'].map(type => ({ type }))
  }
  const save = () => writeFileSync(join(root, 'state.json'), JSON.stringify(state))
  save()
  writeFileSync(join(bin, 'gh'), `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.RELEASE_TEST_ROOT;
const file = path.join(root, 'state.json');
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
const event = value => fs.appendFileSync(path.join(root, 'events.jsonl'), JSON.stringify(value) + '\\n');
const save = () => fs.writeFileSync(file, JSON.stringify(state));
const output = value => console.log(JSON.stringify(value));
const absent = () => { console.error('gh: Not Found (HTTP 404)'); process.exit(1); };
const tasks = ['quality', 'fast', 'slow', 'build', 'chromium-1', 'chromium-2', 'chromium-3', 'chromium-4', 'browser-sandbox', 'webkit'];
const step = name => ({ name, status: 'completed', conclusion: 'success' });
if (args[0] === 'release' && args[1] === 'create') {
  event({ kind: 'release', args, evidence: state.evidence });
  if (state.release) { console.error('already exists'); process.exit(1); }
  state.release = { tag_name: args[2], html_url: 'https://github.com/titanxxh/open-agricola/releases/tag/' + args[2], prerelease: args.includes('--prerelease'), draft: false };
  save(); output(state.release); process.exit(0);
}
const endpoint = args[1].replace('repos/titanxxh/open-agricola/', '');
event({ kind: 'github', endpoint, method: args.includes('POST') ? 'POST' : 'GET' });
if (args.includes('POST')) {
  const body = JSON.parse(fs.readFileSync(0, 'utf8'));
  event({ kind: 'mutation', endpoint, body, evidence: state.evidence });
  if (endpoint === 'git/refs') {
    const ref = body.ref.replace('refs/', '');
    if (state.refs[ref]) { console.error('gh: Reference already exists (HTTP 422)'); process.exit(1); }
    state.refs[ref] = { type: 'commit', sha: body.sha };
  } else if ((endpoint === 'actions/workflows/100/dispatches' || endpoint === 'actions/workflows/200/dispatches')) {
    state.evidence = state.afterDispatch;
    if (state.moveMain) state.mainSha = state.nextMainSha;
  } else throw Error('Unexpected mutation: ' + endpoint);
  save(); output({}); process.exit(0);
}
if (Object.hasOwn(state.provenance, args[1])) {
  let metadata = state.provenance[args[1]];
  if (metadata && metadata.binary) { process.stdout.write(fs.readFileSync(metadata.binary)); process.exit(0); }
  if (endpoint === 'git/ref/heads/main') metadata = { ...metadata, object: { type: 'commit', sha: state.mainSha } };
  if (Array.isArray(metadata) && args.includes('--paginate')) metadata.forEach(output); else output(metadata);
} else if (endpoint.startsWith('commits/')) {
  const ref = decodeURIComponent(endpoint.slice(8));
  const sha = ref === 'main' ? state.mainSha : state.refs['heads/' + ref]?.sha ?? (ref === state.sha ? state.sha : null);
  if (!sha) absent(); output({ sha });
} else if (endpoint === 'actions/workflows/prerelease-candidate-verification.yml') output({ id: 200, path: '.github/workflows/prerelease-candidate-verification.yml' });
else if (endpoint === 'actions/workflows/candidate-verification.yml') output({ id: 100, path: '.github/workflows/candidate-verification.yml' });
else if (endpoint.startsWith('actions/workflows/200/runs?')) {
  if (state.evidence !== 'missing') output({ id: 2, workflow_id: 200, path: '.github/workflows/prerelease-candidate-verification.yml', event: 'workflow_dispatch', head_sha: state.mainSha, head_branch: 'main', display_title: 'prerelease / ' + state.sha + ' / all',
    repository: { id: 1164782262, full_name: 'titanxxh/open-agricola' }, head_repository: { id: 1164782262 }, status: 'completed', run_attempt: 1,
    updated_at: '2026-10-30T00:15:00Z', html_url: 'https://github.com/titanxxh/open-agricola/actions/runs/2' });
} else if (endpoint === 'actions/runs/2/jobs?filter=all&per_page=100') {
  const configuration = state.preConfiguration;
  output({ id: 1, run_id: 2, run_attempt: 1, name: 'candidate-manifest', status: 'completed', conclusion: 'success', html_url: 'https://example.test/run/2',
    started_at: '2026-10-30T00:00:00Z', completed_at: '2026-10-30T00:01:00Z',
    steps: [step('Generate candidate manifest'), step('Prerelease manifest / 1164782262 / prerelease / ' + state.sha + ' / ' + configuration + ' / ' + state.mainSha + ' / ' + tasks.join(','))] });
  tasks.forEach((task, index) => output({ id: index + 2, run_id: 2, run_attempt: 1, name: 'candidate / ' + task + ' / ' + configuration,
    started_at: '2026-10-30T00:05:00Z', completed_at: '2026-10-30T00:10:00Z', status: 'completed', conclusion: task === 'webkit' && state.evidence === 'failed' ? 'failure' : 'success',
    html_url: 'https://example.test/job/' + task, steps: ['Checkout candidate', 'Install dependencies', 'Verify candidate checkout', 'Execute verification task', 'Install browsers', 'Prepare candidate isolation', 'Prove native candidate isolation', 'Stop candidate descendants and collect private diagnostics'].map(step) }));
} else if (endpoint.startsWith('actions/workflows/100/runs?')) {
  if (state.evidence !== 'missing') output({ id: 1, workflow_id: 100, path: '.github/workflows/candidate-verification.yml', event: 'workflow_dispatch', head_sha: state.mainSha, head_branch: 'main', display_title: 'stable / ' + state.sha + ' / all',
    repository: { id: 1164782262, full_name: 'titanxxh/open-agricola' }, head_repository: { id: 1164782262 },
    status: 'completed', run_attempt: 1, created_at: '2026-10-30T00:00:00Z', updated_at: '2026-10-30T00:15:00Z', html_url: 'https://github.com/titanxxh/open-agricola/actions/runs/1' });
} else if (endpoint === 'actions/runs/1/jobs?filter=all&per_page=100') {
  output({ id: 1, run_id: 1, run_attempt: 1, name: 'candidate-manifest', status: 'completed', conclusion: 'success', html_url: 'https://example.test/run/1',
    started_at: '2026-10-30T00:00:00Z', completed_at: '2026-10-30T00:01:00Z',
    steps: [step('Generate candidate manifest'), step('Stable manifest / 1164782262 / stable / ' + state.sha + ' / ' + state.configuration + ' / ' + state.mainSha + ' / ' + tasks.join(','))] });
  tasks.forEach((task, index) => output({ id: index + 2, run_id: 1, run_attempt: 1, name: 'candidate / ' + task + ' / ' + state.configuration,
    started_at: '2026-10-30T00:05:00Z', completed_at: '2026-10-30T00:10:00Z',
    status: 'completed', conclusion: task === 'webkit' && state.evidence === 'failed' ? 'failure' : 'success', html_url: 'https://example.test/job/' + task,
    steps: ['Checkout candidate', 'Install dependencies', 'Verify candidate checkout', 'Execute verification task', 'Install browsers', 'Prepare candidate isolation', 'Prove native candidate isolation', 'Stop candidate descendants and collect private diagnostics'].map(step) }));
} else if (endpoint.startsWith('git/ref/')) {
  const ref = decodeURIComponent(endpoint.slice(8));
  if (!state.refs[ref]) absent(); output({ ref: 'refs/' + ref, object: state.refs[ref] });
} else if (endpoint.startsWith('git/tags/')) {
  const target = state.annotatedTags[endpoint.slice(9)];
  if (!target) absent(); output({ object: target });
} else if (endpoint.startsWith('releases/tags/')) {
  if (!state.release) absent(); output(state.release);
} else throw Error('Unexpected GitHub endpoint: ' + endpoint);
`)
  chmodSync(join(bin, 'gh'), 0o755)
  writeFileSync(join(bin, 'ssh'), `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
fs.appendFileSync(path.join(process.env.RELEASE_TEST_ROOT, 'events.jsonl'), JSON.stringify({ kind: 'ssh', args: process.argv.slice(2) }) + '\\n');
`)
  chmodSync(join(bin, 'ssh'), 0o755)
  const events = (): { kind: string; args?: string[]; endpoint?: string; body?: unknown; evidence?: string }[] => existsSync(join(root, 'events.jsonl'))
    ? readFileSync(join(root, 'events.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line)) : []
  const publishVersion = (version: string, ...args: string[]) => spawnSync('pnpm', ['--silent', 'release', version, '--poll-seconds', '0.01', '--timeout-seconds', '0.1', ...args], {
    cwd: root, env, encoding: 'utf8', timeout: 30_000,
  })
  const publish = (...args: string[]) => publishVersion('v9.9.9', ...args)
  const deploy = (...args: string[]) => spawnSync('bash', [join(root, 'deploy-backend.sh'), ...args], { cwd: root, env, encoding: 'utf8', timeout: 30_000 })
  return { root, bin, sha, state, save, env, invoke, publish, publishVersion, deploy, events }
}

function imageInputs(value: ReturnType<typeof fixture>, failure = '') {
  const prefix = 'repos/titanxxh/open-agricola/', payload = join(value.root, 'payload')
  mkdirSync(join(payload, 'blobs/sha256'), { recursive: true })
  execFileSync('git', ['checkout', '--detach', value.sha], { cwd: value.root, stdio: 'ignore' })
  const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex')
  const config = JSON.stringify({ os: 'linux', architecture: 'amd64', config: { Labels: { 'org.opencontainers.image.revision': value.sha, 'io.open-agricola.release-channel': 'stable' } }, rootfs: { type: 'layers', diff_ids: [] } })
  const imageId = `sha256:${hash(config)}`, digest = `sha256:${'b'.repeat(64)}`
  writeFileSync(join(payload, 'config.json'), config)
  writeFileSync(join(payload, 'blobs/sha256', imageId.slice(7)), config)
  writeFileSync(join(payload, 'manifest.json'), JSON.stringify([{ Config: 'config.json', RepoTags: null, Layers: [] }]))
  const manifest = JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json', config: { mediaType: 'application/vnd.oci.image.config.v1+json', digest: imageId, size: Buffer.byteLength(config) }, layers: [] })
  writeFileSync(join(payload, 'blobs/sha256', hash(manifest)), manifest)
  writeFileSync(join(payload, 'index.json'), JSON.stringify({ schemaVersion: 2, manifests: [{ mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: `sha256:${hash(manifest)}`, size: Buffer.byteLength(manifest) }] }))
  const archive = join(value.root, 'image.tar')
  execFileSync('tar', ['-cf', archive, '-C', payload, 'config.json', 'manifest.json', 'index.json', 'blobs'])
  const receipt = { format: 1, repository: 'titanxxh/open-agricola', repositoryId: 1164782262, purpose: 'formal-candidate', channel: 'stable', sourceSha: value.sha, producerSha: value.sha,
    platform: 'linux/amd64', registryRepository: 'ghcr.io/titanxxh/open-agricola-images', manifestDigest: digest, imageId, build: { runId: 80, runAttempt: 1 },
    verification: { kind: 'stable', configuration: value.state.configuration, producerConfiguration: verificationConfiguration(value.root, value.sha),
      tasks: FULL_TASK_IDS.map((id, index) => ({ id, runId: 1, jobId: index + 2, runAttempt: 1 })).sort((a, b) => a.id.localeCompare(b.id)) } }
  const receiptPath = join(value.root, 'container-image-receipt.json'), zip = join(value.root, 'receipt.zip')
  writeFileSync(receiptPath, JSON.stringify(receipt)); execFileSync('zip', ['-jq', zip, receiptPath])
  const artifact = readFileSync(zip)
  Object.assign(value.state.provenance, {
    [prefix + 'actions/workflows/container-image-build.yml']: { id: 300, path: '.github/workflows/container-image-build.yml' },
    [prefix + 'actions/runs/80/attempts/1']: { id: 80, run_attempt: 1, workflow_id: 300, path: '.github/workflows/container-image-build.yml', event: 'workflow_dispatch', head_branch: 'main', head_sha: value.sha, status: 'completed', conclusion: failure === 'provenance' ? 'failure' : 'success', run_started_at: '2026-11-13T00:00:00Z', updated_at: '2026-11-13T00:02:00Z', repository: { id: 1164782262, full_name: 'titanxxh/open-agricola' }, head_repository: { id: 1164782262, full_name: 'titanxxh/open-agricola' } },
    [prefix + 'actions/artifacts/90']: { id: 90, name: 'container-image-receipt-80-1', expired: false, size_in_bytes: artifact.length, digest: `sha256:${hash(artifact)}`, created_at: '2026-11-13T00:01:00Z', workflow_run: { id: 80, head_sha: value.sha, head_branch: 'main', repository_id: 1164782262, head_repository_id: 1164782262 } },
    [prefix + 'actions/artifacts/90/zip']: { binary: zip },
  })
  FULL_TASK_IDS.forEach((_id, index) => { value.state.provenance[prefix + `actions/jobs/${index + 2}`] = { id: index + 2, run_id: 1, run_attempt: 1, status: 'completed', conclusion: 'success' } }); value.save()
  const auth = join(value.root, 'auth.json'), budget = join(value.root, 'budget.json')
  writeFileSync(auth, JSON.stringify({ username: 'fixture-owner', token: 'private-fixture-token' }), { mode: 0o600 })
  writeFileSync(budget, JSON.stringify({ format: 1, import: { maxArchiveMiB: 1, memoryHeadroomMiB: 512, intake: { memoryMiB: 384, cpus: 1, pids: 64 } }, diskMiB: 256, reserveMemoryMiB: failure === 'budget' ? 0 : 512 }), { mode: 0o600 })
  const metadata = { format: 1, gameBuildId: value.sha, basePath: '/open-agricola/', releaseChannel: 'stable', deploymentTarget: 'stable-hosted' }
  writeFileSync(join(value.bin, 'docker'), `#!${process.execPath}
const fs=require('node:fs'),a=process.argv.slice(2),cmd=a[0]==='--config'?a.slice(4):a;fs.appendFileSync(${JSON.stringify(join(value.root, 'events.jsonl'))},JSON.stringify({kind:'owner-docker',args:cmd})+'\\n');
if(cmd[0]==='context')console.log(JSON.stringify([{Endpoints:{docker:{Host:'unix:///var/run/docker.sock'}}}]));
else if(cmd[0]==='info')console.log('[]');else if(cmd[0]==='login'){if(fs.readFileSync(0,'utf8').trim()!=='private-fixture-token')process.exit(2);}
else if(cmd[0]==='pull'){if(${JSON.stringify(failure)}==='pull')process.exit(42);}
else if(cmd[0]==='image'&&cmd[1]==='save')process.stdout.write(fs.readFileSync(${JSON.stringify(archive)}));
else if(cmd[0]==='image')console.log(JSON.stringify([{Id:${JSON.stringify(imageId)},Os:'linux',Architecture:'amd64',Config:JSON.parse(${JSON.stringify(config)}).config,RepoDigests:[${JSON.stringify(receipt.registryRepository + '@' + digest)}]}]));
else if(cmd[0]==='create')console.log('f'.repeat(64));else if(cmd[0]==='cp')fs.writeFileSync(cmd.at(-1),${JSON.stringify(JSON.stringify(metadata))});else if(cmd[0]!=='rm')process.exit(3);
`, { mode: 0o700 })
  writeFileSync(join(value.bin, 'scp'), `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path'),a=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(join(value.root, 'events.jsonl'))},JSON.stringify({kind:'scp',args:a})+'\\n');const source=a[1],target=a[2].slice(a[2].indexOf(':')+1);fs.copyFileSync(source,target);fs.chmodSync(target,0o600);
`, { mode: 0o700 })
  const remote = join(value.root, 'remote');mkdirSync(join(remote, 'data'), { recursive: true });writeFileSync(join(remote, 'data/postgres-cutover.validated'), '')
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
  writeFileSync(join(value.bin, 'git'), `#!${process.execPath}
const cp=require('node:child_process'),a=process.argv.slice(2);if(process.cwd()===${JSON.stringify(remote)}){
if(a[0]==='status'||a[0]==='fetch')process.exit(0);if(a[0]==='rev-parse'){console.log(${JSON.stringify(failure === 'fetch' ? 'f'.repeat(40) : value.sha)});process.exit(0)}
if(a[0]==='archive')a.unshift('-C',${JSON.stringify(value.root)});}
const result=cp.spawnSync(${JSON.stringify(realGit)},a,{stdio:'inherit'});process.exit(result.status??1);
`, { mode: 0o700 })
  writeFileSync(join(value.bin, 'ssh'), `#!${process.execPath}
const fs=require('node:fs'),cp=require('node:child_process'),a=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(join(value.root, 'events.jsonl'))},JSON.stringify({kind:'ssh',args:a})+'\\n');
if(a[1].includes("'bash' '-s'")){const r=cp.spawnSync('bash',['-c',a[1]],{input:fs.readFileSync(0),encoding:'utf8'});process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exit(r.status??1)}
if(a[1].includes('backend-image-receiver.ts'))console.log(${JSON.stringify(imageId)});else console.log('Current build: '+${JSON.stringify(value.sha)});
`, { mode: 0o700 })
  return { remote, flags: ['--build-run', '80', '--build-attempt', '1', '--artifact-id', '90', '--auth-file', auth, '--import-budget', budget] }
}

describe('owner-machine release entry', () => {
  it.each(['release', 'backend'])('rejects an unmerged producer before protected %s side effects', entry => {
    const value = fixture()
    value.state.provenance[`repos/titanxxh/open-agricola/commits/${value.sha}/pulls?per_page=100`] = []
    value.save()
    const result = entry === 'release' ? value.publish() : value.deploy()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Candidate is ineligible for formal verification')
    expect(value.events().filter(event => ['release', 'mutation', 'ssh'].includes(event.kind))).toEqual([])
  })

  it('creates the Release for the fixed candidate after complete GitHub evidence passes', () => {
    const value = fixture()
    const result = value.publish()
    expect(result.status, result.stderr).toBe(0)
    expect(value.events().filter(event => event.kind === 'release')).toEqual([{
      kind: 'release', evidence: 'passed', args: ['release', 'create', 'v9.9.9', '--repo', 'titanxxh/open-agricola', '--target', value.sha, '--verify-tag', '--generate-notes'],
    }])
    expect(value.events().filter(event => event.kind === 'mutation')).toEqual([{
      kind: 'mutation', endpoint: 'git/refs', evidence: 'passed', body: { ref: 'refs/tags/v9.9.9', sha: value.sha },
    }])
    expect(value.events().findIndex(event => event.endpoint === 'actions/runs/1/jobs?filter=all&per_page=100')).toBeLessThan(
      value.events().findIndex(event => event.kind === 'release'),
    )
  })

  it('requests the fixed candidate and publishes that SHA even if main moves while verification runs', () => {
    const value = fixture()
    value.state.evidence = 'missing'
    value.state.moveMain = true
    value.save()
    const result = value.publish()
    expect(result.status, result.stderr).toBe(0)
    expect(value.events().filter(event => event.endpoint === 'actions/workflows/100/dispatches' && event.kind === 'mutation')).toEqual([{
      kind: 'mutation', endpoint: 'actions/workflows/100/dispatches', evidence: 'missing', body: {
        ref: 'main', inputs: { candidate_sha: value.sha, tasks: 'quality,fast,slow,build,chromium-1,chromium-2,chromium-3,chromium-4,browser-sandbox,webkit' },
      },
    }])
    expect(value.events().filter(event => event.kind === 'release')[0]?.args).toContain(value.sha)
    expect(readFileSync(join(value.root, 'state.json'), 'utf8')).toContain(`"mainSha":"${value.state.nextMainSha}"`)
  })

  it('reuses an existing Release and tag on retry without creating or rewriting either', () => {
    const value = fixture()
    expect(value.publish().status).toBe(0)
    const retry = value.publish()
    expect(retry.status, retry.stderr).toBe(0)
    expect(JSON.parse(retry.stdout)).toMatchObject({ status: 'existing', version: 'v9.9.9', sha: value.sha })
    expect(value.events().filter(event => event.kind === 'release')).toHaveLength(1)
    expect(value.events().filter(event => event.kind === 'mutation')).toHaveLength(1)
  }, 15_000)

  it('requests only the failed task and refuses publication while that task remains failed, regardless of local rehearsal', () => {
    const value = fixture()
    value.state.evidence = 'failed'
    value.state.afterDispatch = 'failed'
    value.save()
    mkdirSync(join(value.root, 'output/verification'), { recursive: true })
    writeFileSync(join(value.root, 'output/verification/rehearsal.json'), JSON.stringify({ status: 'passed', sha: value.sha }))
    const result = value.publish()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Full GitHub verification is incomplete')
    expect(value.events().filter(event => event.kind === 'release')).toEqual([])
    expect(value.events().filter(event => event.kind === 'mutation' && event.endpoint === 'git/refs')).toEqual([{
      kind: 'mutation', endpoint: 'git/refs', evidence: 'failed', body: { ref: `refs/heads/verification/candidates/${value.sha}`, sha: value.sha },
    }])
    expect(value.events().filter(event => event.kind === 'mutation' && event.endpoint === 'actions/workflows/100/dispatches')).toEqual([{
      kind: 'mutation', endpoint: 'actions/workflows/100/dispatches', evidence: 'failed', body: {
        ref: 'main', inputs: { candidate_sha: value.sha, tasks: 'webkit' },
      },
    }])
  })

  it.each([false, true])('rejects an existing version tag on another SHA, including a pre-existing Release (%s)', releaseExists => {
    const value = fixture()
    value.state.refs['tags/v9.9.9'] = { type: 'commit', sha: 'b'.repeat(40) }
    if (releaseExists) value.state.release = { tag_name: 'v9.9.9', html_url: 'https://example.test/release' }
    value.save()
    const result = value.publish()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Existing tag v9.9.9 points to a different SHA')
    expect(value.events().filter(event => event.kind === 'release' || event.kind === 'mutation')).toEqual([])
  })

  it('reuses an annotated version tag that resolves to the fixed candidate', () => {
    const value = fixture()
    value.state.refs['tags/v9.9.9'] = { type: 'tag', sha: 'd'.repeat(40) }
    value.state.annotatedTags['d'.repeat(40)] = { type: 'commit', sha: value.sha }
    value.save()
    const result = value.publish()
    expect(result.status, result.stderr).toBe(0)
    expect(value.events().filter(event => event.kind === 'mutation')).toEqual([])
    expect(value.events().filter(event => event.kind === 'release')).toHaveLength(1)
  })

  it('refuses to move an existing candidate branch that points to another SHA', () => {
    const value = fixture()
    value.state.evidence = 'missing'
    value.state.refs[`heads/verification/candidates/${value.sha}`] = { type: 'commit', sha: 'b'.repeat(40) }
    value.save()
    const result = value.publish()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('points to a different SHA')
    expect(value.events().filter(event => event.kind === 'release' || event.kind === 'mutation')).toEqual([])
  })

  it('retries incomplete verification on the same candidate branch without rewriting it', () => {
    const value = fixture()
    value.state.evidence = 'failed'
    value.state.afterDispatch = 'failed'
    value.save()
    expect(value.publish().status).toBe(1)
    value.state.afterDispatch = 'passed'
    value.state.refs[`heads/verification/candidates/${value.sha}`] = { type: 'commit', sha: value.sha }
    value.save()
    const result = value.publish('--ref', value.sha)
    expect(result.status, result.stderr).toBe(0)
    expect(value.events().filter(event => event.kind === 'mutation' && event.endpoint === 'git/refs')).toEqual([
      { kind: 'mutation', endpoint: 'git/refs', evidence: 'failed', body: { ref: `refs/heads/verification/candidates/${value.sha}`, sha: value.sha } },
      { kind: 'mutation', endpoint: 'git/refs', evidence: 'passed', body: { ref: 'refs/tags/v9.9.9', sha: value.sha } },
    ])
    expect(value.events().filter(event => event.kind === 'release')).toHaveLength(1)
  }, 15_000)

  it('rejects release execution in CI before contacting GitHub', () => {
    const value = fixture()
    value.env.GITHUB_ACTIONS = 'true'
    const result = value.publish()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('owner-controlled machine, outside CI')
    expect(value.events()).toEqual([])
  })
})

describe('direct backend deployment entry', () => {
  it('requires verified fixed image input even after formal candidate verification passes', () => {
    const value = fixture()
    const result = value.deploy('fixture-host', value.sha)
    expect(result.status, result.stdout).not.toBe(0)
    expect(result.stderr).toContain('Fixed formal image evidence is required')
    expect(value.events().filter(event => event.kind === 'ssh')).toEqual([])
  })

  it.each(['provenance', 'budget', 'pull'])('rejects fixed image %s before first SSH', failure => {
    const value = fixture(), image = imageInputs(value, failure)
    const result = value.deploy('fixture-host', value.sha, image.remote, ...image.flags)
    expect(result.status).not.toBe(0)
    expect(value.events().filter(event => event.kind === 'ssh' || event.kind === 'scp')).toEqual([])
    expect(result.stdout + result.stderr).not.toContain('private-fixture-token')
  }, 30_000)

  it('rejects a substituted remote fetch before intake or maintenance', () => {
    const value = fixture(), image = imageInputs(value, 'fetch')
    const result = value.deploy('fixture-host', value.sha, image.remote, ...image.flags)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Fetched backend candidate mismatch')
    expect(value.events().filter(event => event.kind === 'scp')).toEqual([])
  }, 30_000)

  it('transports a fixed formal image and renews native authority before maintenance without forwarding credentials', () => {
    const value = fixture(), image = imageInputs(value)
    const result = value.deploy('fixture-host', value.sha, image.remote, ...image.flags)
    expect(result.status, result.stderr).toBe(0)
    const events = value.events(), ssh = events.filter(event => event.kind === 'ssh'), copies = events.filter(event => event.kind === 'scp')
    expect(ssh).toHaveLength(3)
    expect(ssh[1]?.args?.[1]).toContain('backend-image-receiver.ts')
    expect(ssh[2]?.args?.[1]).toContain('backend-image-maintenance.ts')
    expect(copies).toHaveLength(3)
    expect(copies[0]?.args?.[1]).toMatch(/\/image.tar$/)
    expect(copies.slice(1).every(event => event.args?.[1]?.endsWith('/request.json'))).toBe(true)
    const nativeChecks = events.filter(event => event.endpoint === 'actions/runs/80/attempts/1')
    expect(nativeChecks).toHaveLength(2)
    const recheck = nativeChecks.at(1), intake = ssh.at(1), maintenance = ssh.at(2)
    if (!recheck || !intake || !maintenance) throw new Error('Missing owner transport phases')
    expect(events.indexOf(recheck)).toBeGreaterThan(events.indexOf(intake))
    expect(events.indexOf(recheck)).toBeLessThan(events.indexOf(maintenance))
    expect(JSON.stringify(copies)).not.toMatch(/auth.json|private-fixture-token/)
    expect(JSON.stringify(ssh) + result.stdout + result.stderr).not.toContain('private-fixture-token')
    expect(events.filter(event => event.kind === 'owner-docker').some(event => event.args?.[0] === 'pull' && event.args.at(-1)?.includes('@sha256:'))).toBe(true)
  }, 30_000)

  it.each(['default', 'explicit ref'])('rejects %s deployment before any production SSH when full GitHub evidence is incomplete', mode => {
    const value = fixture()
    value.state.evidence = 'failed'
    value.save()
    const result = mode === 'default' ? value.deploy() : value.deploy('fixture-host', value.sha)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Full GitHub verification is incomplete')
    expect(value.events().filter(event => event.kind === 'ssh' || event.kind === 'mutation')).toEqual([])
  })

  it('refuses execution in CI before GitHub or production access', () => {
    const value = fixture()
    value.env.CI = 'true'
    const result = value.deploy()
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('owner-controlled machine, outside CI')
    expect(value.events()).toEqual([])
  })
})


describe('explicit prerelease publication', () => {
  it('publishes and resumes an unmerged fixed candidate as a native prerelease', () => {
    const value = fixture(true)
    const run = () => value.publishVersion('v9.9.9-beta.1', '--channel', 'prerelease', '--ref', value.sha)
    const first = run()
    expect(first.status, first.stderr).toBe(0)
    expect(JSON.parse(first.stdout)).toMatchObject({ channel: 'prerelease', sha: value.sha, status: 'published' })
    expect(value.events().find(event => event.kind === 'release')?.args).toContain('--prerelease')
    const retry = run()
    expect(retry.status, retry.stderr).toBe(0)
    expect(JSON.parse(retry.stdout)).toMatchObject({ status: 'existing', channel: 'prerelease' })
    expect(value.events().filter(event => event.kind === 'release')).toHaveLength(1)
  }, 20_000)

  it.each([
    ['v9.9.9-beta.1', 'stable'], ['v9.9.9', 'prerelease'], ['v9.9.9-rc.1', 'prerelease'], ['v9.9.9-beta.0', 'prerelease'],
  ])('rejects version %s for channel %s before any mutation', (version, channel) => {
    const value = fixture()
    const result = value.publishVersion(version, '--channel', channel)
    expect(result.status).toBe(1)
    expect(value.events().filter(event => event.kind === 'release' || event.kind === 'mutation')).toEqual([])
  })

  it('refuses an existing native prerelease on the stable channel', () => {
    const value = fixture()
    value.state.refs['tags/v9.9.9'] = { type: 'commit', sha: value.sha }
    value.state.release = { tag_name: 'v9.9.9', html_url: 'https://example.test/release', prerelease: true, draft: false }
    value.save()
    const result = value.publish()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('channel')
    expect(value.events().filter(event => event.kind === 'mutation')).toEqual([])
  })
})
