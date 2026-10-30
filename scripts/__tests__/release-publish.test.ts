import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { finalSnapshotMetadata } from './_helpers/candidate-provenance'

const repository = resolve(import.meta.dirname, '../..')
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

type Evidence = 'passed' | 'missing' | 'failed'
type GitHubState = {
  sha: string
  configuration: string
  evidence: Evidence
  afterDispatch: Evidence
  mainSha: string
  nextMainSha: string
  provenance: Record<string, unknown>
  moveMain: boolean
  refs: Record<string, { sha: string; type: string }>
  annotatedTags: Record<string, { sha: string; type: string }>
  release: { tag_name: string; html_url: string } | null
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'oa-release-entry-'))
  roots.push(root)
  mkdirSync(join(root, 'scripts'), { recursive: true })
  mkdirSync(join(root, '.github/workflows'), { recursive: true })
  cpSync(join(repository, 'scripts/ci'), join(root, 'scripts/ci'), { recursive: true })
  cpSync(join(repository, 'scripts/release'), join(root, 'scripts/release'), { recursive: true })
  cpSync(join(repository, '.github/workflows/candidate-verification.yml'), join(root, '.github/workflows/candidate-verification.yml'))
  cpSync(join(repository, 'deploy-backend.sh'), join(root, 'deploy-backend.sh'))
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
  const sha = git('rev-parse', 'HEAD')
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
    sha, configuration: value.configuration, evidence: 'passed', afterDispatch: 'passed',
    mainSha: sha, nextMainSha, provenance: finalSnapshotMetadata(sha), moveMain: false, refs: {}, annotatedTags: {}, release: null,
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
  state.release = { tag_name: args[2], html_url: 'https://github.com/titanxxh/open-agricola/releases/tag/' + args[2] };
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
  } else if (endpoint === 'actions/workflows/100/dispatches') {
    state.evidence = state.afterDispatch;
    if (state.moveMain) state.mainSha = state.nextMainSha;
  } else throw Error('Unexpected mutation: ' + endpoint);
  save(); output({}); process.exit(0);
}
if (Object.hasOwn(state.provenance, args[1])) {
  let metadata = state.provenance[args[1]];
  if (endpoint === 'git/ref/heads/main') metadata = { ...metadata, object: { type: 'commit', sha: state.mainSha } };
  if (Array.isArray(metadata) && args.includes('--paginate')) metadata.forEach(output); else output(metadata);
} else if (endpoint.startsWith('commits/')) {
  const ref = decodeURIComponent(endpoint.slice(8));
  const sha = ref === 'main' ? state.mainSha : state.refs['heads/' + ref]?.sha ?? (ref === state.sha ? state.sha : null);
  if (!sha) absent(); output({ sha });
} else if (endpoint === 'actions/workflows/candidate-verification.yml') output({ id: 100, path: '.github/workflows/candidate-verification.yml' });
else if (endpoint.startsWith('actions/workflows/100/runs?')) {
  if (state.evidence !== 'missing') output({ id: 1, workflow_id: 100, path: '.github/workflows/candidate-verification.yml', event: 'workflow_dispatch', head_sha: state.sha,
    repository: { id: 1164782262, full_name: 'titanxxh/open-agricola' }, head_repository: { id: 1164782262 },
    status: 'completed', run_attempt: 1, created_at: '2026-10-30T00:00:00Z', updated_at: '2026-10-30T00:15:00Z', html_url: 'https://github.com/titanxxh/open-agricola/actions/runs/1' });
} else if (endpoint === 'actions/runs/1/jobs?filter=all&per_page=100') {
  output({ id: 1, run_id: 1, run_attempt: 1, name: 'candidate-manifest', status: 'completed', conclusion: 'success', html_url: 'https://example.test/run/1',
    started_at: '2026-10-30T00:00:00Z', completed_at: '2026-10-30T00:01:00Z',
    steps: [step('Generate candidate manifest'), step('Candidate manifest / ' + state.sha + ' / ' + state.configuration + ' / ' + tasks.join(','))] });
  tasks.forEach((task, index) => output({ id: index + 2, run_id: 1, run_attempt: 1, name: 'candidate / ' + task + ' / ' + state.configuration,
    started_at: '2026-10-30T00:05:00Z', completed_at: '2026-10-30T00:10:00Z',
    status: 'completed', conclusion: task === 'webkit' && state.evidence === 'failed' ? 'failure' : 'success', html_url: 'https://example.test/job/' + task,
    steps: ['Checkout candidate', 'Install dependencies', 'Verify candidate checkout', 'Execute verification task', 'Install browsers'].map(step) }));
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
  const publish = (...args: string[]) => spawnSync('pnpm', ['--silent', 'release', 'v9.9.9', '--poll-seconds', '0.01', '--timeout-seconds', '0.1', ...args], {
    cwd: root, env, encoding: 'utf8', timeout: 30_000,
  })
  const deploy = (...args: string[]) => spawnSync('bash', [join(root, 'deploy-backend.sh'), ...args], { cwd: root, env, encoding: 'utf8', timeout: 30_000 })
  return { root, bin, sha, state, save, env, invoke, publish, deploy, events }
}

function remoteFixture(value: ReturnType<typeof fixture>, { fetchSha = value.sha, checkoutSha = value.sha } = {}) {
  const remote = join(value.root, 'remote')
  mkdirSync(join(remote, 'scripts'), { recursive: true })
  mkdirSync(join(remote, 'data'), { recursive: true })
  writeFileSync(join(remote, 'data/postgres-cutover.validated'), '')
  writeFileSync(join(remote, '.env'), '')
  writeFileSync(join(remote, 'scripts/backup-storage.sh'), '#!/usr/bin/env bash\nexit 0\n')
  writeFileSync(join(remote, 'scripts/local-services.mjs'), `import { appendFileSync } from 'node:fs'; appendFileSync(process.env.RELEASE_TEST_ROOT + '/events.jsonl', JSON.stringify({ kind: 'remote-services' }) + '\\n');\n`)
  writeFileSync(join(remote, 'state.json'), JSON.stringify({ head: 'a'.repeat(40), fetchSha, checkoutSha }))
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
  const realPnpm = execFileSync('which', ['pnpm'], { encoding: 'utf8' }).trim()
  const prefix = `#!${process.execPath}
const fs = require('node:fs'); const path = require('node:path'); const { spawnSync } = require('node:child_process');
const root = process.env.RELEASE_TEST_ROOT; const remote = path.join(root, 'remote'); const args = process.argv.slice(2);
const event = value => fs.appendFileSync(path.join(root, 'events.jsonl'), JSON.stringify(value) + '\\n');
`
  writeFileSync(join(value.bin, 'git'), prefix + `
if (process.cwd() !== remote) { const result = spawnSync(${JSON.stringify(realGit)}, args, { stdio: 'inherit' }); process.exit(result.status ?? 1); }
event({ kind: 'remote-git', args });
const file = path.join(remote, 'state.json'); const state = JSON.parse(fs.readFileSync(file, 'utf8'));
if (args[0] === 'status') process.exit(0);
if (args[0] === 'fetch') process.exit(0);
if (args[0] === 'rev-parse') console.log(args[1].startsWith('FETCH_HEAD') ? state.fetchSha : state.head);
else if (args[0] === 'checkout') { state.head = state.checkoutSha; fs.writeFileSync(file, JSON.stringify(state)); }
else throw Error('Unexpected remote git: ' + args.join(' '));
`)
  writeFileSync(join(value.bin, 'pnpm'), prefix + `
if (process.cwd() !== remote) { const result = spawnSync(${JSON.stringify(realPnpm)}, args, { stdio: 'inherit' }); process.exit(result.status ?? 1); }
event({ kind: 'remote-pnpm', args });
`)
  writeFileSync(join(value.bin, 'docker'), prefix + `event({ kind: 'remote-docker', args });\n`)
  writeFileSync(join(value.bin, 'ssh'), prefix + `
event({ kind: 'ssh', args });
const stateFile = path.join(root, 'state.json'); const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
if (state.moveMain) { state.mainSha = state.nextMainSha; fs.writeFileSync(stateFile, JSON.stringify(state)); }
const result = spawnSync('bash', ['-c', args[1]], { input: fs.readFileSync(0), encoding: 'utf8' });
process.stdout.write(result.stdout); process.stderr.write(result.stderr); process.exit(result.status ?? 1);
`)
  for (const name of ['git', 'pnpm', 'docker', 'ssh']) chmodSync(join(value.bin, name), 0o755)
  return remote
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
        ref: `verification/candidates/${value.sha}`, inputs: { candidate_sha: value.sha, tasks: 'quality,fast,slow,build,chromium-1,chromium-2,chromium-3,chromium-4,browser-sandbox,webkit' },
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
  })

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
        ref: `verification/candidates/${value.sha}`, inputs: { candidate_sha: value.sha, tasks: 'webkit' },
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
  })

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
  it.each(['default', 'explicit ref'])('rejects %s deployment before any production SSH when full GitHub evidence is incomplete', mode => {
    const value = fixture()
    value.state.evidence = 'failed'
    value.save()
    const result = mode === 'default' ? value.deploy() : value.deploy('fixture-host', value.sha)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Full GitHub verification is incomplete')
    expect(value.events().filter(event => event.kind === 'ssh' || event.kind === 'mutation')).toEqual([])
  })

  it('refuses a remote fetch that does not contain the verified candidate before installing or building', () => {
    const value = fixture()
    const remote = remoteFixture(value, { fetchSha: 'b'.repeat(40) })
    const result = value.deploy('fixture-host', value.sha, remote)
    expect(result.status, result.stdout).not.toBe(0)
    expect(result.stderr).toContain('Fetched backend candidate mismatch')
    expect(value.events().filter(event => event.kind === 'remote-pnpm' || event.kind === 'remote-docker' || event.kind === 'remote-services')).toEqual([])
  }, 30_000)

  it('refuses a remote checkout that differs from the verified candidate before installing or building', () => {
    const value = fixture()
    const remote = remoteFixture(value, { checkoutSha: 'b'.repeat(40) })
    const result = value.deploy('fixture-host', value.sha, remote)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Checked-out backend candidate mismatch')
    expect(value.events().filter(event => event.kind === 'remote-pnpm' || event.kind === 'remote-docker' || event.kind === 'remote-services')).toEqual([])
  }, 30_000)

  it('deploys the verified SHA when main moves after the local gate, and reports that SHA as the deployed build', () => {
    const value = fixture()
    const remote = remoteFixture(value)
    value.state.moveMain = true
    value.save()
    const result = value.deploy('fixture-host', 'main', remote)
    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(join(remote, 'data/deployed-build-id'), 'utf8')).toBe(value.sha + '\n')
    const events = value.events()
    expect(events.filter(event => event.kind === 'remote-git' && event.args?.[0] === 'fetch')).toEqual([{
      kind: 'remote-git', args: ['fetch', 'origin', value.sha],
    }])
    expect(events.findIndex(event => event.endpoint === 'actions/runs/1/jobs?filter=all&per_page=100')).toBeLessThan(events.findIndex(event => event.kind === 'ssh'))
    expect(events.filter(event => event.kind === 'remote-docker' && event.args?.includes('build'))).toHaveLength(1)
    expect(result.stdout).toContain(`Current build: ${value.sha}`)
  }, 30_000)

  it('refuses execution in CI before GitHub or production access', () => {
    const value = fixture()
    value.env.CI = 'true'
    const result = value.deploy()
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('owner-controlled machine, outside CI')
    expect(value.events()).toEqual([])
  })
})
