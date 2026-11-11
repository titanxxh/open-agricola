import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkPrereleaseVerification, requestPrereleaseVerification, runPrereleaseCandidateTask, syncPrerelease, validateIntegrationManifest } from '../ci/prerelease-verification'

const roots: string[] = []
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'oa-prerelease-'))
  roots.push(cwd)
  const repository = 'titanxxh/open-agricola'
  mkdirSync(join(cwd, '.github/workflows'), { recursive: true })
  cpSync(resolve(import.meta.dirname, '../ci'), join(cwd, 'scripts/ci'), { recursive: true })
  for (const name of ['candidate-verification.yml', 'prerelease-candidate-verification.yml']) {
    writeFileSync(join(cwd, '.github/workflows', name), name)
  }
  writeFileSync(join(cwd, 'package.json'), '{}')
  writeFileSync(join(cwd, 'pnpm-lock.yaml'), 'lockfileVersion: 9')
  writeFileSync(join(cwd, '.gitignore'), 'bin/\napi.json\ncalls.jsonl\n')
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-b', 'main'); git('config', 'user.name', 'Pre Test'); git('config', 'user.email', 'pre@example.test')
  git('add', '.'); git('commit', '-m', 'base')
  const main = git('rev-parse', 'HEAD')
  git('checkout', '-b', 'prerelease')
  writeFileSync(join(cwd, 'feature.txt'), 'Beta feature')
  git('add', '.'); git('commit', '-m', 'feature')
  const feature = git('rev-parse', 'HEAD')
  const manifest = { format: 1, repository, baselineMainSha: main, features: [{ id: 'feature-1', dependsOn: Array<string>(), sourceSha: feature, integratedSha: feature }] }
  writeFileSync(join(cwd, 'prerelease-integration.json'), JSON.stringify(manifest))
  git('add', '.'); git('commit', '-m', 'integration manifest')
  const sha = git('rev-parse', 'HEAD')
  const fixedRef = `verification/prerelease/${sha}`
  const api: Record<string, unknown> = {
    [`repos/${repository}`]: { id: 1164782262, full_name: repository, default_branch: 'main' },
    [`repos/${repository}/git/ref/heads/main`]: { ref: 'refs/heads/main', object: { type: 'commit', sha: main } },
    [`repos/${repository}/git/ref/heads/prerelease`]: { ref: 'refs/heads/prerelease', object: { type: 'commit', sha } },
    [`repos/${repository}/git/ref/heads/verification/prerelease/${sha}`]: { ref: `refs/heads/${fixedRef}`, object: { type: 'commit', sha } },
    [`repos/${repository}/rules/branches/main?per_page=100`]: ['pull_request', 'non_fast_forward', 'deletion', 'required_linear_history'].map(type => ({ type })),
    [`repos/${repository}/rules/branches/prerelease?per_page=100`]: ['pull_request', 'deletion', 'required_linear_history'].map(type => ({ type })),
    [`repos/${repository}/rules/branches/${encodeURIComponent(fixedRef)}?per_page=100`]: ['non_fast_forward', 'deletion', 'update'].map(type => ({ type })),
    [`repos/${repository}/actions/workflows/prerelease-candidate-verification.yml`]: { id: 200, path: '.github/workflows/prerelease-candidate-verification.yml' },
    [`repos/${repository}/actions/workflows/200/runs?event=workflow_dispatch&per_page=100`]: [],
  }
  const save = () => writeFileSync(join(cwd, 'api.json'), JSON.stringify(api))
  save()
  const bin = join(cwd, 'bin'); mkdirSync(bin)
  writeFileSync(join(bin, 'gh'), `#!${process.execPath}
const fs = require('node:fs'); const path = require('node:path');
const root = ${JSON.stringify(cwd)}; const args = process.argv.slice(2); const api = JSON.parse(fs.readFileSync(path.join(root, 'api.json'), 'utf8'));
const body = args.includes('POST') ? JSON.parse(fs.readFileSync(0, 'utf8')) : null;
fs.appendFileSync(path.join(root, 'calls.jsonl'), JSON.stringify({ args, body }) + '\\n');
if (body) { console.log('{}'); process.exit(0); }
const value = api[args[1]];
if (value === undefined) { console.error('gh: Not Found (HTTP 404)'); process.exit(1); }
if (args.includes('--paginate')) value.forEach(x => console.log(JSON.stringify(x))); else console.log(JSON.stringify(value));
`)
  chmodSync(join(bin, 'gh'), 0o755)
  vi.stubEnv('PATH', bin + delimiter + process.env.PATH)
  vi.stubEnv('CI', ''); vi.stubEnv('GITHUB_ACTIONS', '')
  const calls = () => readFileSync(join(cwd, 'calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
  return { cwd, repository, sha, main, feature, manifest, fixedRef, api, save, git, calls, bin }
}

describe('fixed prerelease candidates and main orchestration', () => {
  it('admits an unmerged prerelease snapshot while reporting missing complete evidence', () => {
    const value = fixture()
    const result = checkPrereleaseVerification(value.cwd, value.repository, value.sha)
    expect(result.status).toBe('blocked')
    expect(result.channel).toBe('prerelease')
    expect(result.tasks.every(task => task.reason === 'No verified task evidence')).toBe(true)
  })

  it('dispatches the trusted main workflow with the immutable pre reference and only requested failed tasks', () => {
    const value = fixture()
    requestPrereleaseVerification(value.cwd, value.repository, value.sha, 'fast,webkit')
    expect(value.calls().filter(call => call.body)).toEqual([{ args: [
      'api', `repos/${value.repository}/actions/workflows/200/dispatches`, '--method', 'POST', '--input', '-',
    ], body: { ref: 'main', inputs: { candidate_sha: value.sha, candidate_ref: value.fixedRef, tasks: 'fast,webkit' } } }])
  })

  it('keeps a fixed candidate eligible after the mutable integration ref advances', () => {
    const value = fixture()
    value.api[`repos/${value.repository}/git/ref/heads/prerelease`] = { ref: 'refs/heads/prerelease', object: { type: 'commit', sha: value.main } }
    value.save()
    expect(checkPrereleaseVerification(value.cwd, value.repository, value.sha).status).toBe('blocked')
  })

  it.each(['fixed SHA', 'immutable protection', 'main protection'])('rejects wrong %s before requesting a workflow', failure => {
    const value = fixture()
    if (failure === 'fixed SHA') value.api[`repos/${value.repository}/git/ref/heads/verification/prerelease/${value.sha}`] = { object: { type: 'commit', sha: value.main } }
    else if (failure === 'immutable protection') value.api[`repos/${value.repository}/rules/branches/${encodeURIComponent(value.fixedRef)}?per_page=100`] = []
    else {
      value.api[`repos/${value.repository}/rules/branches/main?per_page=100`] = []
      value.api[`repos/${value.repository}/branches/main/protection`] = {}
    }
    value.save()
    expect(() => requestPrereleaseVerification(value.cwd, value.repository, value.sha, 'all')).toThrow()
    expect(value.calls().filter(call => call.body)).toEqual([])
  })

  it('rejects a stale integration base and unknown feature dependencies', () => {
    const value = fixture()
    expect(() => validateIntegrationManifest(value.cwd, value.repository, value.sha, value.main)).not.toThrow()
    expect(() => validateIntegrationManifest(value.cwd, value.repository, value.sha, value.feature)).toThrow(/baseline/)
    value.manifest.features[0].dependsOn.push('missing')
    writeFileSync(join(value.cwd, 'prerelease-integration.json'), JSON.stringify(value.manifest))
    value.git('add', '.'); value.git('commit', '-m', 'bad dependency')
    expect(() => validateIntegrationManifest(value.cwd, value.repository, value.git('rev-parse', 'HEAD'), value.main)).toThrow(/dependency/)
  })

  it('refuses a lease conflict without invoking git push', () => {
    const value = fixture()
    expect(() => syncPrerelease(value.cwd, value.repository, value.sha, value.main, value.main)).toThrow(/lease/)
  })
})

function synchronizationFixture() {
  const value = fixture()
  const remote = mkdtempSync(join(tmpdir(), 'oa-prerelease-remote-'))
  roots.push(remote)
  value.git('init', '--bare', remote)
  value.git('push', remote, `${value.sha}:refs/heads/prerelease`, `${value.sha}:refs/heads/${value.fixedRef}`, `${value.sha}:refs/tags/v9.9.9-beta.1`)
  value.git('checkout', 'main')
  writeFileSync(join(value.cwd, 'main-fix.txt'), 'formal fix')
  value.git('add', '.'); value.git('commit', '-m', 'main fix')
  const main = value.git('rev-parse', 'HEAD')
  value.git('checkout', '-b', 'synchronized')
  value.git('cherry-pick', value.feature)
  const integratedSha = value.git('rev-parse', 'HEAD')
  value.manifest.baselineMainSha = main
  value.manifest.features[0].integratedSha = integratedSha
  writeFileSync(join(value.cwd, 'prerelease-integration.json'), JSON.stringify(value.manifest))
  value.git('add', '.'); value.git('commit', '-m', 'updated integration baseline')
  const sha = value.git('rev-parse', 'HEAD')
  value.git('push', remote, `${main}:refs/heads/main`)
  value.api[`repos/${value.repository}/git/ref/heads/main`] = { ref: 'refs/heads/main', object: { type: 'commit', sha: main } }
  value.save()
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
  const log = join(remote, 'push.json')
  const install = (race = false) => {
    writeFileSync(join(value.bin, 'git'), `#!${process.execPath}
const fs = require('node:fs'); const cp = require('node:child_process'); const args = process.argv.slice(2);
if (args[0] === 'push') {
  fs.writeFileSync(${JSON.stringify(log)}, JSON.stringify(args));
  if (${race}) cp.execFileSync(${JSON.stringify(realGit)}, ['--git-dir', ${JSON.stringify(remote)}, 'update-ref', 'refs/heads/prerelease', ${JSON.stringify(main)}]);
  args[2] = ${JSON.stringify(remote)};
}
const result = cp.spawnSync(${JSON.stringify(realGit)}, args, { stdio: 'inherit' }); process.exit(result.status ?? 1);
`)
    chmodSync(join(value.bin, 'git'), 0o755)
  }
  const ref = (name: string) => execFileSync(realGit, ['--git-dir', remote, 'rev-parse', name], { encoding: 'utf8' }).trim()
  return { ...value, sha, old: value.sha, main, remote, log, install, ref }
}

describe('owner main synchronization with an exact Git lease', () => {
  it('updates only prerelease and keeps release tags and immutable candidates fixed', () => {
    const value = synchronizationFixture()
    value.install()
    syncPrerelease(value.cwd, value.repository, value.sha, value.old, value.main)
    expect(JSON.parse(readFileSync(value.log, 'utf8'))).toEqual(['push', `--force-with-lease=refs/heads/prerelease:${value.old}`,
      `https://github.com/${value.repository}.git`, `${value.sha}:refs/heads/prerelease`])
    expect(value.ref('refs/heads/prerelease')).toBe(value.sha)
    expect(value.ref('refs/heads/main')).toBe(value.main)
    expect(value.ref(`refs/heads/${value.fixedRef}`)).toBe(value.old)
    expect(value.ref('refs/tags/v9.9.9-beta.1')).toBe(value.old)
  })

  it('lets Git reject a concurrent update after the initial API read without overwriting it', () => {
    const value = synchronizationFixture()
    value.install(true)
    expect(() => syncPrerelease(value.cwd, value.repository, value.sha, value.old, value.main)).toThrow()
    expect(value.ref('refs/heads/prerelease')).toBe(value.main)
    expect(value.ref(`refs/heads/${value.fixedRef}`)).toBe(value.old)
  })

  it('refuses feature additions or removals through the synchronization exception', () => {
    const value = synchronizationFixture()
    value.manifest.features[0].id = 'unreviewed-replacement'
    writeFileSync(join(value.cwd, 'prerelease-integration.json'), JSON.stringify(value.manifest))
    value.git('add', '.'); value.git('commit', '-m', 'feature replacement')
    expect(() => syncPrerelease(value.cwd, value.repository, value.git('rev-parse', 'HEAD'), value.old, value.main)).toThrow(/reviewed PR/)
    expect(value.ref('refs/heads/prerelease')).toBe(value.old)
  })
})

describe('channel-specific workflow and artifact targets', () => {
  it('runs ordinary prerelease pushes and PRs through canonical CI while isolating manual full verification', () => {
    const root = resolve(import.meta.dirname, '../..')
    const routine = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8')
    expect(routine.match(/branches: \[main, prerelease\]/g)).toHaveLength(2)
    expect(routine).toContain('scripts/ci/scoped-verification.ts plan')
    const workflow = readFileSync(join(root, '.github/workflows/prerelease-candidate-verification.yml'), 'utf8')
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'")
    expect(workflow).toContain('contents: read')
    expect(workflow).not.toMatch(/secrets:|contents: write|pages: write|id-token: write|self-hosted|environment:/)
    expect(workflow).toContain('persist-credentials: false')
    expect(workflow).not.toContain('  push:')
    expect(workflow).not.toContain('  pull_request:')
    expect(workflow.slice(workflow.indexOf('\n  task:'))).not.toContain('GH_TOKEN:')
    expect(workflow).toContain('run-name: prerelease / ${{ inputs.candidate_sha }} / ${{ inputs.tasks }}')
  })
})


it('builds explicit hosted artifact identity and refuses a prerelease Pages target before invoking the builder', () => {
  const value = fixture()
  const source = resolve(import.meta.dirname, '../..')
  cpSync(join(source, 'scripts/build-frontend.ts'), join(value.cwd, 'scripts/build-frontend.ts'))
  mkdirSync(join(value.cwd, 'shared/contract/protocol'), { recursive: true })
  cpSync(join(source, 'shared/contract/protocol/app-location.ts'), join(value.cwd, 'shared/contract/protocol/app-location.ts'))
  value.git('add', '.'); value.git('commit', '-m', 'frontend tool')
  writeFileSync(join(value.bin, 'pnpm'), `#!${process.execPath}
const fs = require('node:fs');
fs.mkdirSync('dist', { recursive: true });
fs.appendFileSync('bin/build-calls.txt', 'build\\n');
`)
  chmodSync(join(value.bin, 'pnpm'), 0o755)
  const run = (mode: string, channel: string) => spawnSync(join(source, 'node_modules/.bin/tsx'), ['scripts/build-frontend.ts', mode], {
    cwd: value.cwd, env: { ...process.env, RELEASE_CHANNEL: channel, GAME_BUILD_ID: value.sha }, encoding: 'utf8',
  })
  const pre = run('hosted', 'prerelease')
  expect(pre.status, pre.stderr).toBe(0)
  expect(JSON.parse(readFileSync(join(value.cwd, 'dist/frontend-build.json'), 'utf8'))).toEqual({ format: 1, gameBuildId: value.sha,
    basePath: '/open-agricola/', releaseChannel: 'prerelease', deploymentTarget: 'prerelease-hosted' })
  const rejected = run('pages', 'prerelease')
  expect(rejected.status).toBe(1)
  expect(rejected.stderr).toContain('cannot target formal Pages')
  expect(readFileSync(join(value.bin, 'build-calls.txt'), 'utf8').trim().split('\n')).toHaveLength(1)
})


it('runs baseline regressions in stable runtime and builds the pre production artifact with no formal token', () => {
  const value = fixture()
  writeFileSync(join(value.bin, 'pnpm'), `#!${process.execPath}
const fs = require('node:fs');
fs.appendFileSync('bin/task-environment.jsonl', JSON.stringify({ args: process.argv.slice(2), channel: process.env.RELEASE_CHANNEL,
  verificationChannel: process.env.VERIFICATION_CHANNEL, sha: process.env.GAME_BUILD_ID,
  hasToken: !!(process.env.GH_TOKEN || process.env.GITHUB_TOKEN) }) + '\\n');
`)
  chmodSync(join(value.bin, 'pnpm'), 0o755)
  vi.stubEnv('GITHUB_SHA', value.main)
  vi.stubEnv('RELEASE_CHANNEL', 'prerelease')
  vi.stubEnv('GH_TOKEN', 'formal-token-must-not-reach-candidate')
  vi.stubEnv('GITHUB_TOKEN', 'formal-token-must-not-reach-candidate')
  runPrereleaseCandidateTask(value.cwd, 'build', value.sha, value.main)
  runPrereleaseCandidateTask(value.cwd, 'webkit', value.sha, value.main)
  const calls = readFileSync(join(value.bin, 'task-environment.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
  expect(calls).toEqual([
    { args: ['run', 'build:hosted-frontend'], channel: 'prerelease', verificationChannel: 'prerelease', sha: value.sha, hasToken: false },
    { args: ['run', 'build:replay-viewer'], channel: 'stable', verificationChannel: 'prerelease', sha: value.sha, hasToken: false },
    { args: ['run', 'check:bundle-size'], channel: 'stable', verificationChannel: 'prerelease', sha: value.sha, hasToken: false },
    { args: ['run', 'verify:e2e:webkit'], channel: 'stable', verificationChannel: 'prerelease', sha: value.sha, hasToken: false },
  ])
})
