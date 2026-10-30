import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { verificationConfiguration } from '../ci/verification-tasks'

const repoRoot = resolve(import.meta.dirname, '../..')
const repository = 'titanxxh/open-agricola'
const requestPath = '.github/workflows/pages-release-request.yml'
const legacyPath = '.github/workflows/deploy-pages.yml'
const brokerPath = '.github/workflows/deploy-pages-broker.yml'
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

it('records a release request at a fresh workflow path without building or publishing', () => {
  const workflow = readFileSync(join(repoRoot, '.github/workflows/pages-release-request.yml'), 'utf8')
  expect(workflow.startsWith('name: Pages Release Request\n')).toBe(true)
  expect([...workflow.split('\npermissions:')[0].matchAll(/^ {2}([a-z_]+):/gm)].map(match => match[1])).toEqual(['release'])
  expect(workflow).not.toContain('uses:')
  expect(workflow).not.toContain('pages: write')
  expect(existsSync(join(repoRoot, '.github/workflows/deploy-pages.yml'))).toBe(false)
  const summary = join(mkdtempSync(join(tmpdir(), 'pages-request-')), 'summary.md')
  roots.push(resolve(summary, '..'))
  const command = /^ {8}run: (.+)$/m.exec(workflow)?.[1]
  if (!command) throw new Error('Release request must record its fixed candidate')
  const result = spawnSync('bash', ['-e', '-c', command], { env: { ...process.env,
    CANDIDATE_SHA: 'a'.repeat(40), GITHUB_STEP_SUMMARY: summary }, encoding: 'utf8' })
  expect(result.status, result.stderr).toBe(0)
  expect(readFileSync(summary, 'utf8')).toContain('Requested Pages deployment for `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`')
})

function fixture(eventName: 'workflow_run' | 'workflow_dispatch' = 'workflow_run') {
  const root = mkdtempSync(join(tmpdir(), 'pages-broker-'))
  roots.push(root)
  const cwd = join(root, 'policy')
  const bin = join(root, 'bin')
  const temporary = join(root, 'temporary')
  for (const directory of [join(cwd, '.github/workflows'), join(cwd, 'scripts'), bin, temporary]) mkdirSync(directory, { recursive: true })
  cpSync(join(repoRoot, 'scripts/ci'), join(cwd, 'scripts/ci'), { recursive: true })
  cpSync(join(repoRoot, '.github/workflows/candidate-verification.yml'), join(cwd, '.github/workflows/candidate-verification.yml'))
  cpSync(join(repoRoot, 'scripts/__tests__/fixtures/pages-v0.11.5.yml'), join(cwd, legacyPath))
  writeFileSync(join(cwd, 'scripts/ci/pages-deployment.ts'), "throw new Error('The candidate gate must never execute')\n")
  writeFileSync(join(cwd, 'package.json'), '{"type":"module","scripts":{}}\n')
  writeFileSync(join(cwd, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
  writeFileSync(join(cwd, '.gitignore'), 'node_modules/\ndist-pages/\n')
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-b', 'main')
  git('config', 'user.name', 'Pages Test')
  git('config', 'user.email', 'pages@example.test')
  const commit = (message: string) => {
    git('add', '--all', '--', '.', ':(exclude)docs/superpowers/**')
    git('commit', '-m', message)
    return git('rev-parse', 'HEAD')
  }
  const sha = commit('historical candidate fixture')
  rmSync(join(cwd, legacyPath))
  cpSync(join(repoRoot, requestPath), join(cwd, requestPath))
  cpSync(join(repoRoot, 'scripts/ci/pages-deployment.ts'), join(cwd, 'scripts/ci/pages-deployment.ts'))
  cpSync(join(repoRoot, brokerPath), join(cwd, brokerPath))
  const policySha = commit('current main policy fixture')
  git('checkout', '--detach', policySha)
  const configuration = verificationConfiguration(cwd, sha)
  const tasks = ['quality', 'fast', 'slow', 'build', 'chromium-1', 'chromium-2', 'chromium-3', 'chromium-4', 'browser-sandbox', 'webkit']
  const step = (name: string) => ({ name, status: 'completed', conclusion: 'success' })
  const candidateWorkflow = { id: 100, path: '.github/workflows/candidate-verification.yml' }
  const candidateRun = { id: 1, workflow_id: 100, path: candidateWorkflow.path, event: 'workflow_dispatch', head_sha: sha,
    repository: { full_name: repository }, status: 'completed', run_attempt: 1,
    created_at: '2026-10-30T00:00:00Z', updated_at: '2026-10-30T00:15:00Z', html_url: `https://github.com/${repository}/actions/runs/1` }
  const jobs = tasks.map((task, index) => ({ id: index + 2, run_id: 1, run_attempt: 1,
    started_at: '2026-10-30T00:05:00Z', completed_at: '2026-10-30T00:10:00Z',
    name: `candidate / ${task} / ${configuration}`, status: 'completed', conclusion: 'success', html_url: candidateRun.html_url,
    steps: ['Checkout candidate', 'Install dependencies', 'Verify candidate checkout', 'Execute verification task', 'Install browsers'].map(step) }))
  jobs.unshift({ id: 1, run_id: 1, run_attempt: 1, name: 'candidate-manifest', status: 'completed', conclusion: 'success', html_url: candidateRun.html_url,
    started_at: '2026-10-30T00:00:00Z', completed_at: '2026-10-30T00:01:00Z',
    steps: [step('Generate candidate manifest'), step(`Candidate manifest / ${sha} / ${configuration} / ${tasks.join(',')}`)] })
  const requestWorkflow = { id: 200, path: requestPath }
  const requestRun = { id: 99, workflow_id: 200, path: requestPath, event: 'release', head_sha: sha, run_attempt: 1,
    repository: { full_name: repository }, head_repository: { full_name: repository }, status: 'completed', conclusion: 'success' }
  const environment = { deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } }
  const policies = { total_count: 1, branch_policies: [{ id: 10, name: 'main', type: 'branch' }] }
  const event = { action: 'completed', repository: { full_name: repository, default_branch: 'main' },
    workflow_run: { ...requestRun }, inputs: { candidate_sha: sha } }
  const prefix = `repos/${repository}`
  const responses = {
    [`${prefix}/actions/workflows/pages-release-request.yml`]: requestWorkflow,
    [`${prefix}/actions/runs/99`]: requestRun,
    [`${prefix}/environments/github-pages`]: environment,
    [`${prefix}/environments/github-pages/deployment-branch-policies?per_page=100`]: policies,
    [`${prefix}/actions/workflows/candidate-verification.yml`]: candidateWorkflow,
    [`${prefix}/actions/workflows/100/runs?head_sha=${sha}&event=workflow_dispatch&per_page=100`]: { workflow_runs: [candidateRun] },
    [`${prefix}/actions/runs/1/jobs?filter=all&per_page=100`]: { jobs },
  }
  const eventFile = join(root, 'event.json')
  const githubFile = join(root, 'github.json')
  const log = join(root, 'commands.jsonl')
  const save = () => {
    writeFileSync(eventFile, JSON.stringify(event))
    writeFileSync(githubFile, JSON.stringify(responses))
  }
  save()
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
  writeFileSync(join(bin, 'git'), `#!${process.execPath}
const fs = require('node:fs'); const cp = require('node:child_process'); const args = process.argv.slice(2);
fs.appendFileSync(process.env.COMMAND_LOG, JSON.stringify(['git', ...args]) + '\\n');
const result = cp.spawnSync(${JSON.stringify(realGit)}, args, { stdio: 'inherit' }); process.exit(result.status ?? 1);
`)
  writeFileSync(join(bin, 'gh'), `#!${process.execPath}
const fs = require('node:fs'); const cp = require('node:child_process');
const args = process.argv.slice(2); const endpoint = args[1];
fs.appendFileSync(process.env.COMMAND_LOG, JSON.stringify(['gh', ...args]) + '\\n');
if (args[0] !== 'api' || args.includes('POST') || args.includes('DELETE')) throw Error('Read-only GitHub fixture');
const response = JSON.parse(fs.readFileSync(process.env.GITHUB_FIXTURE, 'utf8'))[endpoint];
if (!response) throw Error('Unexpected GitHub endpoint: ' + endpoint);
if (process.env.PAGES_TEST_MOVE_REF) {
  cp.execFileSync('git', ['update-ref', 'refs/heads/main', process.env.PAGES_TEST_MOVE_REF]);
  cp.execFileSync('git', ['update-ref', 'refs/tags/v1.0.0', process.env.PAGES_TEST_MOVE_REF]);
}

if (process.env.PAGES_TEST_CHANGE_POLICY) fs.writeFileSync('uncommitted-policy.ts', 'export const changed = true');
if (args.includes('--paginate')) {
  const key = args[args.indexOf('--jq') + 1].split('[]')[0].slice(1);
  for (const item of response[key]) console.log(JSON.stringify(item));
} else console.log(JSON.stringify(response));
`)
  writeFileSync(join(bin, 'pnpm'), `#!${process.execPath}
const fs = require('node:fs'); const cp = require('node:child_process');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.COMMAND_LOG, JSON.stringify(['pnpm', ...args]) + '\\n');
if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) throw Error('Candidate received a GitHub token');
if (args[0] === 'install' && process.env.PAGES_TEST_INSTALL_FAIL === '1') process.exit(8);
if (args[0] === 'install' && process.env.PAGES_TEST_INSTALL_CHANGE_SOURCE === '1') fs.writeFileSync('install-source.ts', 'export const changed = true');
if (args.join(' ') === 'run build:pages-frontend') {
  if (process.env.PAGES_TEST_BUILD_FAIL === '1') process.exit(7);
  if (process.env.PAGES_TEST_NO_OUTPUT === '1') process.exit(0);
  if (process.env.PAGES_TEST_CHANGE_SOURCE === '1') fs.writeFileSync('uncommitted-candidate.ts', 'export const changed = true');
  fs.mkdirSync('dist-pages', { recursive: true });
  fs.writeFileSync('dist-pages/index.html', cp.execFileSync('git', ['rev-parse', 'HEAD']));
  fs.writeFileSync('dist-pages/frontend-build.json', JSON.stringify({ format: 1,
    gameBuildId: process.env.PAGES_TEST_BUILD_ID || process.env.GAME_BUILD_ID, basePath: '/' }));
}
`)
  writeFileSync(join(bin, 'corepack'), `#!${process.execPath}\n`)
  writeFileSync(join(bin, 'pages-action'), `#!${process.execPath}
const fs = require('node:fs'); const args = process.argv.slice(2);
fs.appendFileSync(process.env.COMMAND_LOG, JSON.stringify(['pages-action', ...args]) + '\\n');
if (args[0] === 'upload') fs.copyFileSync(args[1] + '/frontend-build.json', process.env.PAGES_TEST_UPLOAD);
if (args[0] === 'deploy') fs.copyFileSync(process.env.PAGES_TEST_UPLOAD, process.env.PAGES_TEST_DEPLOYMENT);
`)
  for (const command of ['git', 'gh', 'pnpm', 'corepack', 'pages-action']) chmodSync(join(bin, command), 0o755)
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: bin + delimiter + process.env.PATH, COMMAND_LOG: log,
    GITHUB_FIXTURE: githubFile, GITHUB_SHA: policySha, GITHUB_WORKFLOW_SHA: policySha,
    GITHUB_WORKFLOW_REF: `${repository}/${brokerPath}@refs/heads/main`, GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: eventName, GITHUB_EVENT_PATH: eventFile, GITHUB_REPOSITORY: repository,
    RUNNER_TEMP: temporary, GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '',
    PAGES_TEST_UPLOAD: join(root, 'upload.json'), PAGES_TEST_DEPLOYMENT: join(root, 'deployment.json') }
  const run = (...args: string[]) => spawnSync(process.execPath, [join(cwd, 'scripts/ci/pages-deployment.ts'), ...args], { cwd, env, encoding: 'utf8' })
  const build = () => run('build', '--repository', repository)
  const commands = () => existsSync(log) ? readFileSync(log, 'utf8') : ''
  return { cwd, root, sha, policySha, configuration, env, git, commit, run, build, commands, event,
    requestRun, requestWorkflow, candidateRun, jobs, environment, policies, save }
}

function runWorkflow(value: ReturnType<typeof fixture>) {
  const workflow = readFileSync(join(repoRoot, brokerPath), 'utf8')
  const events = [...workflow.split('\npermissions:')[0].matchAll(/^ {2}([a-z_]+):/gm)].map(match => match[1])
  expect(events).toEqual(['workflow_run', 'workflow_dispatch'])
  const jobs = workflow.split('\n  deploy:')
  if (jobs.length !== 2 || !/^ {4}needs: build$/m.test(jobs[1])) throw new Error('Pages deployment must require the verified build job')
  const buildPolicy = jobs[0].split('\npermissions:')[1].split('\nconcurrency:')[0]
  expect(buildPolicy).toContain('  actions: read')
  expect(buildPolicy).not.toContain('pages: write')
  expect(buildPolicy).not.toContain('id-token: write')
  expect(jobs[1]).toContain('      pages: write')
  expect(jobs[1]).toContain('      id-token: write')
  if (!workflow.includes('workflows: [Pages Release Request]') || !workflow.includes('types: [completed]')) {
    throw new Error('Pages broker must use the original release request workflow')
  }
  const expand = (input: string): string => input.replace(/\$\{\{ (.*?) \}\}/g, (_, key: string) => {
    if (key === 'github.sha') return value.policySha
    if (key === 'github.token') return 'fixture-read-token'
    if (key.startsWith('vars.')) return ''
    throw new Error(`Unsupported Pages workflow expression ${key}`)
  })
  for (const job of jobs) {
    for (const block of job.split(/(?=^ {6}- )/m).slice(1)) {
      if (/^ {8}if:/m.test(block)) throw new Error('Pages gate steps must not be conditional')
      const env: NodeJS.ProcessEnv = { ...value.env }
      for (const entry of block.matchAll(/^ {10}([A-Z][A-Z0-9_]+): (.*)$/gm)) env[entry[1]] = expand(entry[2])
      const uses = /^ {6,8}(?:- )?uses: (.+)$/m.exec(block)?.[1]
      if (uses?.startsWith('actions/checkout@')) {
        const ref = /^ {10}ref: (.+)$/m.exec(block)?.[1]
        if (!ref || !/^ {10}persist-credentials: false$/m.test(block) || !/^ {10}fetch-depth: 0$/m.test(block)) {
          throw new Error('Pages policy checkout must be immutable, complete, and have no persisted credentials')
        }
        value.git('checkout', '--detach', expand(ref))
      } else if (uses?.startsWith('actions/setup-node@')) continue
      else if (uses?.startsWith('actions/upload-pages-artifact@')) {
        const path = /^ {10}path: (.+)$/m.exec(block)?.[1]
        if (!path) throw new Error('Missing Pages artifact path')
        execFileSync('pages-action', ['upload', expand(path)], { cwd: value.cwd, env })
      } else if (uses?.startsWith('actions/deploy-pages@')) {
        if (value.env.GITHUB_REF !== 'refs/heads/main') throw new Error('Native github-pages environment rejected the deployment ref')
        execFileSync('pages-action', ['deploy'], { cwd: value.cwd, env })
      } else if (uses) throw new Error(`Uncontrolled external action ${uses}`)
      else {
        const command = /^ {8}run: (.+)$/m.exec(block)?.[1]
        if (!command || command === '|') throw new Error('Unsupported Pages workflow run step')
        const result = spawnSync('bash', ['-e', '-c', expand(command)], { cwd: value.cwd, env, encoding: 'utf8' })
        if (result.status !== 0) return result
      }
    }
  }
  return { status: 0, stderr: '' }
}

describe('Pages trusted broker public CLI', () => {
  it('builds a verified historical candidate using current main policy without installing policy dependencies', () => {
    const value = fixture()
    value.env.GAME_BUILD_ID = 'c'.repeat(40)
    const result = value.build()
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(readFileSync(join(value.cwd, 'dist-pages/frontend-build.json'), 'utf8'))).toEqual({
      format: 1, gameBuildId: value.sha, basePath: '/',
    })
    expect(readFileSync(join(value.cwd, 'dist-pages/index.html'), 'utf8').trim()).toBe(value.sha)
    expect(value.git('rev-parse', 'HEAD')).toBe(value.policySha)
    expect(value.commands()).toContain('"pnpm","install","--frozen-lockfile"')
  })

  it.each(['tag ref', 'branch ref', 'workflow ref', 'workflow SHA', 'policy checkout', 'default branch'])('refuses an untrusted %s before candidate checkout or install', (failure) => {
    const value = fixture('workflow_dispatch')
    if (failure === 'tag ref') value.env.GITHUB_REF = 'refs/tags/v0.11.5'
    else if (failure === 'branch ref') value.env.GITHUB_REF = 'refs/heads/feature'
    else if (failure === 'workflow ref') value.env.GITHUB_WORKFLOW_REF = `${repository}/${brokerPath}@refs/tags/v0.11.5`
    else if (failure === 'workflow SHA') value.env.GITHUB_WORKFLOW_SHA = value.sha
    else if (failure === 'policy checkout') {
      value.env.GITHUB_SHA = value.sha
      value.env.GITHUB_WORKFLOW_SHA = value.sha
    }
    else value.event.repository.default_branch = 'feature'
    value.save()
    const result = value.build()
    expect(result.status).toBe(1)
    expect(value.commands()).not.toContain('"worktree","add"')
    expect(value.commands()).not.toContain('"pnpm"')
  })

  it.each(['wrong workflow', 'wrong path', 'ordinary run', 'cancelled request', 'foreign repository', 'foreign head', 'incomplete request', 'forged SHA', 'changed attempt'])('refuses a %s against trusted GitHub metadata', (failure) => {
    const value = fixture()
    if (failure === 'wrong workflow') value.event.workflow_run.workflow_id = 300
    else if (failure === 'wrong path') value.requestRun.path = '.github/workflows/fake.yml'
    else if (failure === 'ordinary run') value.requestRun.event = 'workflow_dispatch'
    else if (failure === 'cancelled request') value.requestRun.conclusion = 'cancelled'
    else if (failure === 'foreign repository') value.requestRun.repository = { full_name: 'other/repository' }
    else if (failure === 'foreign head') value.requestRun.head_repository = { full_name: 'other/repository' }
    else if (failure === 'incomplete request') value.requestRun.status = 'in_progress'
    else if (failure === 'forged SHA') value.event.workflow_run.head_sha = value.policySha
    else value.requestRun.run_attempt = 2
    value.save()
    const result = value.build()
    expect(result.status).toBe(1)
    expect(value.commands()).not.toContain('"worktree","add"')
    expect(value.commands()).not.toContain('"pnpm"')
  })

  it.each(['tag allowlist', 'other branch', 'all protected branches', 'no custom allowlist'])('refuses the native environment with %s before candidate checkout or install', (failure) => {
    const value = fixture()
    if (failure === 'tag allowlist') value.policies.branch_policies.push({ id: 11, name: 'v*', type: 'tag' })
    else if (failure === 'other branch') value.policies.branch_policies.push({ id: 11, name: 'feature', type: 'branch' })
    else if (failure === 'all protected branches') value.environment.deployment_branch_policy.protected_branches = true
    else value.environment.deployment_branch_policy.custom_branch_policies = false
    value.save()
    const result = value.build()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Pages environment must allow only the main branch')
    expect(value.commands()).not.toContain('"worktree","add"')
    expect(value.commands()).not.toContain('"pnpm"')
  })

  it.each(['main', 'v0.11.5', 'a'.repeat(39), 'A'.repeat(40)])('rejects manual candidate input %s', (input) => {
    const value = fixture('workflow_dispatch')
    value.event.inputs.candidate_sha = input
    value.save()
    const result = value.build()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Candidate must be a full lowercase commit SHA')
    expect(value.commands()).not.toContain('"worktree","add"')
    expect(value.commands()).not.toContain('"pnpm"')
  })

  it('refuses historical sources without complete verification configuration before candidate checkout', () => {
    const value = fixture('workflow_dispatch')
    value.git('checkout', '--detach', value.sha)
    rmSync(join(value.cwd, '.github/workflows/candidate-verification.yml'))
    const historical = value.commit('candidate predates complete verification')
    value.git('checkout', '--detach', value.policySha)
    value.event.inputs.candidate_sha = historical
    value.save()
    const result = value.build()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Candidate lacks complete verification configuration')
    expect(value.commands()).not.toContain('"worktree","add"')
    expect(value.commands()).not.toContain('"pnpm"')
  })

  it('refuses caller-supplied SHA overrides instead of bypassing trusted event metadata', () => {
    const value = fixture()
    const result = value.run('build', '--repository', repository, '--sha', value.sha)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Usage: pages-deployment.ts')
    expect(value.commands()).toBe('')
  })
})

describe('retired historical Pages workflow and native protection model', () => {
  function historicalAttempt(ref: string, state: string, allowedBranches: string[]) {
    const workflow = readFileSync(join(repoRoot, 'scripts/__tests__/fixtures/pages-v0.11.5.yml'), 'utf8')
    expect(workflow).toContain('  workflow_dispatch:')
    expect(workflow).toContain('        run: pnpm run build:pages-frontend')
    expect(workflow).toContain('      name: github-pages')
    expect(workflow).toContain('uses: actions/deploy-pages@v5')
    expect(workflow).not.toContain('pages-deployment.ts')
    if (state === 'disabled_manually') return 'Workflow triggers and reruns blocked'
    if (!allowedBranches.some(branch => ref === `refs/heads/${branch}`)) return 'Deployment ref blocked by github-pages'
    return 'Legacy deployment would be allowed'
  }

  it('models main-only environment rejection of an ungated historical tag deployment', () => {
    expect(historicalAttempt('refs/tags/v0.11.5', 'active', ['main'])).toBe('Deployment ref blocked by github-pages')
  })

  it('requires the retired workflow to stay disabled because main-only rules still admit old main-ref reruns', () => {
    expect(historicalAttempt('refs/heads/main', 'active', ['main'])).toBe('Legacy deployment would be allowed')
    expect(historicalAttempt('refs/heads/main', 'disabled_manually', ['main'])).toBe('Workflow triggers and reruns blocked')
  })
})

describe.each(['workflow_run', 'workflow_dispatch'] as const)('Pages deployment workflow boundary (%s)', (eventName) => {
  it('uploads and deploys only the verified candidate built by the current policy', () => {
    const value = fixture(eventName)
    const result = runWorkflow(value)
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(readFileSync(value.env.PAGES_TEST_DEPLOYMENT ?? '', 'utf8'))).toEqual({ format: 1, gameBuildId: value.sha, basePath: '/' })
    expect(value.git('rev-parse', 'HEAD')).toBe(value.policySha)
  })

  it.each(['missing', 'failure', 'cancelled', 'skipped', 'configuration', 'ordinary PR', 'different SHA'])('refuses %s full evidence before checkout, install, upload, or deploy', (failure) => {
    const value = fixture(eventName)
    if (failure === 'missing') value.jobs.pop()
    else if (failure === 'configuration') value.jobs[0].steps[1].name = value.jobs[0].steps[1].name.replace(value.configuration, 'c'.repeat(64))
    else if (failure === 'ordinary PR') value.candidateRun.event = 'pull_request'
    else if (failure === 'different SHA') value.candidateRun.head_sha = value.policySha
    else value.jobs[1].steps[3].conclusion = failure
    value.save()
    const result = runWorkflow(value)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Pages deployment blocked')
    expect(value.commands()).not.toContain('"worktree","add"')
    expect(value.commands()).not.toContain('"pnpm"')
    expect(existsSync(value.env.PAGES_TEST_UPLOAD ?? '')).toBe(false)
    expect(existsSync(value.env.PAGES_TEST_DEPLOYMENT ?? '')).toBe(false)
  })

  it('keeps policy and candidate SHAs fixed even if main and the release tag move during verification', () => {
    const value = fixture(eventName)
    value.git('tag', 'v1.0.0', value.sha)
    value.git('commit', '--allow-empty', '-m', 'later main')
    const later = value.git('rev-parse', 'HEAD')
    value.git('checkout', '--detach', value.policySha)
    value.env.PAGES_TEST_MOVE_REF = later
    const result = runWorkflow(value)
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(readFileSync(value.env.PAGES_TEST_DEPLOYMENT ?? '', 'utf8'))).toEqual({ format: 1, gameBuildId: value.sha, basePath: '/' })
    expect(readFileSync(join(value.cwd, 'dist-pages/index.html'), 'utf8').trim()).toBe(value.sha)
    expect(value.git('rev-parse', 'main')).toBe(later)
    expect(value.git('rev-parse', 'v1.0.0')).toBe(later)
    expect(value.git('rev-parse', 'HEAD')).toBe(value.policySha)
  })

  it.each(['install failure', 'install changed source', 'build failure', 'artifact mismatch', 'changed source', 'changed policy', 'no new artifact'])('does not upload or deploy after %s', (failure) => {
    const value = fixture(eventName)
    if (failure === 'install failure') value.env.PAGES_TEST_INSTALL_FAIL = '1'
    else if (failure === 'install changed source') value.env.PAGES_TEST_INSTALL_CHANGE_SOURCE = '1'
    else if (failure === 'build failure') value.env.PAGES_TEST_BUILD_FAIL = '1'
    else if (failure === 'artifact mismatch') value.env.PAGES_TEST_BUILD_ID = 'c'.repeat(40)
    else if (failure === 'changed source') value.env.PAGES_TEST_CHANGE_SOURCE = '1'
    else if (failure === 'changed policy') value.env.PAGES_TEST_CHANGE_POLICY = '1'
    else {
      mkdirSync(join(value.cwd, 'dist-pages'))
      writeFileSync(join(value.cwd, 'dist-pages/frontend-build.json'), JSON.stringify({ format: 1, gameBuildId: value.sha, basePath: '/' }))
      value.env.PAGES_TEST_NO_OUTPUT = '1'
    }
    const result = runWorkflow(value)
    expect(result.status).toBe(1)
    expect(existsSync(value.env.PAGES_TEST_UPLOAD ?? '')).toBe(false)
    expect(existsSync(value.env.PAGES_TEST_DEPLOYMENT ?? '')).toBe(false)
  })
})
