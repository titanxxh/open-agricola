import { execFileSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { vi } from 'vitest'
import { prereleaseConfiguration } from '../../ci/prerelease-format'
import { FULL_TASK_IDS } from '../../ci/verification-tasks'

// A fixed prerelease candidate over a copy of the policy scripts, with a recording `gh` that serves `api`. Tests call
// `cleanupPrereleaseFixtures` after each case.

const roots: string[] = []
export function cleanupPrereleaseFixtures(): void { vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) }

export function prereleaseFixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'oa-prerelease-'))
  roots.push(cwd)
  const repository = 'titanxxh/open-agricola'
  mkdirSync(join(cwd, '.github/workflows'), { recursive: true })
  cpSync(resolve(import.meta.dirname, '../../ci'), join(cwd, 'scripts/ci'), { recursive: true })
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
if (body) {
  if (args[1].endsWith('/git/refs') && body.ref) {
    api[args[1].slice(0,-1) + '/' + body.ref.slice(5)] = { ref: body.ref, object: { type: 'commit', sha: body.sha } };
    fs.writeFileSync(path.join(root, 'api.json'), JSON.stringify(api));
  }
  console.log('{}'); process.exit(0);
}
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

/** Adds one complete, successful native verification run of `value.sha` produced by `producer`. */
export function passingRun(value: ReturnType<typeof prereleaseFixture>, producer: string, runId: number) {
  const repositoryId = 1164782262, configuration = prereleaseConfiguration(value.cwd, value.sha, producer)
  const step = (name: string) => ({ name, status: 'completed', conclusion: 'success' })
  const run = { id: runId, workflow_id: 200, path: '.github/workflows/prerelease-candidate-verification.yml', event: 'workflow_dispatch', head_sha: producer, head_branch: 'main',
    display_title: `prerelease / ${value.sha} / all`, repository: { id: repositoryId, full_name: value.repository }, head_repository: { id: repositoryId, full_name: value.repository },
    status: 'completed', run_attempt: 1, updated_at: '2026-11-13T01:10:00Z', html_url: `https://github.com/${value.repository}/actions/runs/${runId}` }
  const jobs = FULL_TASK_IDS.map((id, index) => ({ id: runId * 100 + index, run_id: runId, run_attempt: 1, name: `candidate / ${id} / ${configuration}`, status: 'completed', conclusion: 'success',
    started_at: '2026-11-13T01:05:00Z', completed_at: '2026-11-13T01:06:00Z', html_url: run.html_url,
    steps: ['Checkout candidate', 'Install dependencies', 'Verify candidate checkout', 'Execute verification task', 'Install browsers', 'Prepare candidate isolation', 'Prove native candidate isolation', 'Stop candidate descendants and collect private diagnostics'].map(step) }))
  const manifest = { ...jobs[0], id: runId * 100 + 99, name: 'candidate-manifest', started_at: '2026-11-13T01:00:00Z', completed_at: '2026-11-13T01:01:00Z',
    steps: [step('Generate candidate manifest'), step(`Prerelease manifest / ${repositoryId} / prerelease / ${value.sha} / ${configuration} / ${producer} / ${FULL_TASK_IDS.join(',')}`)] }
  const runs = value.api[`repos/${value.repository}/actions/workflows/200/runs?event=workflow_dispatch&per_page=100`] as unknown[]
  runs.unshift(run)
  value.api[`repos/${value.repository}/actions/runs/${runId}/jobs?filter=all&per_page=100`] = [manifest, ...jobs]
  for (const job of jobs) value.api[`repos/${value.repository}/actions/jobs/${job.id}`] = job
  value.save()
  return { jobs, configuration }
}

/** Advances protected main by one commit; a verification configuration file change makes older producers incompatible. */
export function advanceMain(value: ReturnType<typeof prereleaseFixture>, file: string) {
  value.git('checkout', '-q', 'main')
  writeFileSync(join(value.cwd, file), `{"changed":"${file}"}`)
  value.git('add', '.'); value.git('commit', '-m', `main changes ${file}`)
  const main = value.git('rev-parse', 'HEAD')
  value.git('checkout', '-q', 'prerelease')
  value.api[`repos/${value.repository}/git/ref/heads/main`] = { ref: 'refs/heads/main', object: { type: 'commit', sha: main } }
  value.save()
  return main
}

export function synchronizationFixture() {
  const value = prereleaseFixture()
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
