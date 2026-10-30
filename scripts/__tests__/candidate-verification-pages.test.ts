import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { verificationConfiguration } from '../ci/verification-tasks'

const repoRoot = resolve(import.meta.dirname, '../..')
const cli = join(repoRoot, 'scripts/ci/pages-deployment.ts')
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'pages-candidate-'))
  roots.push(cwd)
  mkdirSync(join(cwd, '.github/workflows'), { recursive: true })
  mkdirSync(join(cwd, 'scripts'), { recursive: true })
  cpSync(join(repoRoot, 'scripts/ci'), join(cwd, 'scripts/ci'), { recursive: true })
  cpSync(join(repoRoot, '.github/workflows/candidate-verification.yml'), join(cwd, '.github/workflows/candidate-verification.yml'))
  writeFileSync(join(cwd, 'package.json'), '{"scripts":{}}\n')
  writeFileSync(join(cwd, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
  writeFileSync(join(cwd, '.gitignore'), 'bin/\noutput/\ndist-pages/\n')
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-b', 'main')
  git('config', 'user.name', 'Pages Test')
  git('config', 'user.email', 'pages@example.test')
  git('add', '--all', '--', '.', ':(exclude)docs/superpowers/**')
  git('commit', '-m', 'candidate fixture')
  const sha = git('rev-parse', 'HEAD')
  const bin = join(cwd, 'bin')
  mkdirSync(bin)
  mkdirSync(join(cwd, 'output'))
  const log = join(cwd, 'output/commands.jsonl')
  writeFileSync(join(bin, 'pnpm'), `#!${process.execPath}
const fs = require('node:fs');
const cp = require('node:child_process');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.COMMAND_LOG, JSON.stringify(['pnpm', ...args]) + '\\n');
if (args[0] === 'exec') {
  const result = cp.spawnSync(process.env.PAGES_TEST_TSX, args.slice(2), { stdio: 'inherit', env: process.env });
  process.exit(result.status ?? 1);
}
if (args.join(' ') === 'run build:pages-frontend') {
  if (process.env.PAGES_TEST_BUILD_FAIL === '1') process.exit(7);
  if (process.env.PAGES_TEST_NO_OUTPUT === '1') process.exit(0);
  if (process.env.PAGES_TEST_CHANGE_SOURCE === '1') fs.writeFileSync('new-source.ts', 'export const changed = true');
  fs.mkdirSync('dist-pages', { recursive: true });
  fs.writeFileSync('dist-pages/index.html', cp.execFileSync('git', ['rev-parse', 'HEAD']));
  fs.writeFileSync('dist-pages/frontend-build.json', JSON.stringify({ format: 1,
    gameBuildId: process.env.PAGES_TEST_BUILD_ID || process.env.GAME_BUILD_ID, basePath: '/' }));
}
`)
  chmodSync(join(bin, 'pnpm'), 0o755)
  writeFileSync(join(bin, 'corepack'), `#!${process.execPath}\n`)
  chmodSync(join(bin, 'corepack'), 0o755)
  writeFileSync(join(bin, 'pages-action'), `#!${process.execPath}
const fs = require('node:fs'); const args = process.argv.slice(2);
fs.appendFileSync(process.env.COMMAND_LOG, JSON.stringify(['pages-action', ...args]) + '\\n');
if (args[0] === 'upload') fs.copyFileSync(args[1] + '/frontend-build.json', 'output/upload.json');
if (args[0] === 'deploy') fs.copyFileSync('output/upload.json', 'output/deployment.json');
`)
  chmodSync(join(bin, 'pages-action'), 0o755)
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: bin + delimiter + process.env.PATH,
    COMMAND_LOG: log, PAGES_TEST_TSX: join(repoRoot, 'node_modules/.bin/tsx'),
    GITHUB_SHA: sha, GITHUB_REPOSITORY: 'titanxxh/open-agricola', GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '' }
  const run = (...args: string[]) => spawnSync(join(repoRoot, 'node_modules/.bin/tsx'), [cli, ...args], { cwd, env, encoding: 'utf8' })
  const build = () => run('build', '--sha', sha, '--repository', 'titanxxh/open-agricola')
  return { cwd, sha, bin, env, git, run, build, log }
}

function githubFixture(value: ReturnType<typeof fixture>) {
  const configuration = verificationConfiguration(value.cwd, value.sha)
  const tasks = ['quality', 'fast', 'slow', 'build', 'chromium-1', 'chromium-2', 'chromium-3', 'chromium-4', 'browser-sandbox', 'webkit']
  const step = (name: string) => ({ name, status: 'completed', conclusion: 'success' })
  const workflow = { id: 100, path: '.github/workflows/candidate-verification.yml' }
  const run = { id: 1, workflow_id: 100, path: workflow.path, event: 'workflow_dispatch', head_sha: value.sha,
    repository: { full_name: 'titanxxh/open-agricola' }, status: 'completed', run_attempt: 1,
    created_at: '2026-10-30T00:00:00Z', html_url: 'https://github.com/titanxxh/open-agricola/actions/runs/1' }
  const jobs = tasks.map((task, index) => ({ id: index + 2, run_id: 1, run_attempt: 1,
    name: `candidate / ${task} / ${configuration}`, status: 'completed', conclusion: 'success', html_url: run.html_url,
    steps: ['Checkout candidate', 'Install dependencies', 'Verify candidate checkout', 'Execute verification task', 'Install browsers'].map(step) }))
  jobs.unshift({ id: 1, run_id: 1, run_attempt: 1, name: 'candidate-manifest', status: 'completed', conclusion: 'success', html_url: run.html_url,
    steps: [step('Generate candidate manifest'), step(`Candidate manifest / ${value.sha} / ${configuration} / ${tasks.join(',')}`)] })
  const prefix = 'repos/titanxxh/open-agricola'
  const responses = {
    [`${prefix}/actions/workflows/candidate-verification.yml`]: workflow,
    [`${prefix}/actions/workflows/100/runs?head_sha=${value.sha}&event=workflow_dispatch&per_page=100`]: { workflow_runs: [run] },
    [`${prefix}/actions/runs/1/jobs?filter=all&per_page=100`]: { jobs },
  }
  const save = () => writeFileSync(join(value.cwd, 'output/github.json'), JSON.stringify(responses))
  save()
  writeFileSync(join(value.bin, 'gh'), `#!${process.execPath}
const fs = require('node:fs'); const cp = require('node:child_process');
const args = process.argv.slice(2); const endpoint = args[1];
fs.appendFileSync(process.env.COMMAND_LOG, JSON.stringify(['gh', ...args]) + '\\n');
if (process.env.PAGES_TEST_ACTIONS_READ === '0') { console.error('GitHub token requires actions:read'); process.exit(1); }
const responses = JSON.parse(fs.readFileSync('output/github.json', 'utf8'));
const response = responses[endpoint];
if (!response) { console.error('Unexpected GitHub endpoint: ' + endpoint); process.exit(1); }
if (process.env.PAGES_TEST_MOVE_REF) cp.execFileSync('git', ['update-ref', 'refs/heads/main', process.env.PAGES_TEST_MOVE_REF]);
if (process.env.PAGES_TEST_CHECKOUT) cp.execFileSync('git', ['checkout', '--detach', process.env.PAGES_TEST_CHECKOUT], { stdio: 'pipe' });
if (args.includes('--paginate')) {
  const key = args[args.indexOf('--jq') + 1].split('[]')[0].slice(1);
  for (const item of response[key]) console.log(JSON.stringify(item));
} else console.log(JSON.stringify(response));
`)
  chmodSync(join(value.bin, 'gh'), 0o755)
  return { run, jobs, save }
}

function runWorkflow(value: ReturnType<typeof fixture>, event: 'release' | 'workflow_dispatch') {
  const workflow = readFileSync(join(repoRoot, '.github/workflows/deploy-pages.yml'), 'utf8')
  const eventSection = workflow.split('\npermissions:')[0]
  const events = [...eventSection.matchAll(/^ {2}([a-z_]+):/gm)].map(match => match[1])
  expect(events).toEqual(['release', 'workflow_dispatch'])
  expect(events).toContain(event)
  const jobs = workflow.split('\n  deploy:')
  if (jobs.length !== 2 || !/^ {4}needs: build$/m.test(jobs[1])) throw new Error('Pages deployment must require the verified build job')
  const expand = (input: string): string => input.replace(/\$\{\{ (.*?) \}\}/g, (_, key: string) => {
    if (key === 'github.sha') return value.sha
    if (key === 'github.token') return 'fixture-token'
    if (key.startsWith('vars.')) return ''
    throw new Error(`Unsupported Pages workflow expression ${key}`)
  })
  for (const job of jobs) {
    for (const block of job.split(/(?=^ {6}- )/m).slice(1)) {
      if (/^ {8}if:/m.test(block)) throw new Error('Pages gate steps must not be conditional')
      const env: NodeJS.ProcessEnv = { ...value.env, GITHUB_EVENT_NAME: event,
        PAGES_TEST_ACTIONS_READ: /^ {2}actions: read$/m.test(workflow) ? '1' : '0' }
      for (const entry of block.matchAll(/^ {10}([A-Z][A-Z0-9_]+): (.*)$/gm)) env[entry[1]] = expand(entry[2])
      const uses = /^ {6,8}(?:- )?uses: (.+)$/m.exec(block)?.[1]
      if (uses?.startsWith('actions/checkout@')) {
        const ref = /^ {10}ref: (.+)$/m.exec(block)?.[1] ?? env.GITHUB_REF
        if (!ref) throw new Error('Missing Pages checkout ref')
        value.git('checkout', '--detach', expand(ref))
      } else if (uses?.startsWith('actions/setup-node@')) continue
      else if (uses?.startsWith('actions/upload-pages-artifact@')) {
        const path = /^ {10}path: (.+)$/m.exec(block)?.[1]
        if (!path) throw new Error('Missing Pages artifact path')
        execFileSync('pages-action', ['upload', expand(path)], { cwd: value.cwd, env })
      } else if (uses?.startsWith('actions/deploy-pages@')) {
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

describe('Pages verified build public CLI', () => {
  it('builds a verified candidate with its actual SHA even when an inherited build ID differs', () => {
    const value = fixture()
    githubFixture(value)
    value.env.GAME_BUILD_ID = 'c'.repeat(40)
    const result = value.build()
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(readFileSync(join(value.cwd, 'dist-pages/frontend-build.json'), 'utf8'))).toEqual({
      format: 1, gameBuildId: value.sha, basePath: '/',
    })
    expect(readFileSync(join(value.cwd, 'dist-pages/index.html'), 'utf8').trim()).toBe(value.sha)
  })

  it.each(['missing', 'failure', 'cancelled', 'skipped', 'configuration', 'ordinary PR', 'different SHA'])('refuses %s evidence before building Pages', (failure) => {
    const value = fixture()
    const github = githubFixture(value)
    if (failure === 'missing') github.jobs.pop()
    else if (failure === 'configuration') github.jobs[0].steps[1].name = github.jobs[0].steps[1].name.replace(/ [a-f0-9]{64} /, ` ${'c'.repeat(64)} `)
    else if (failure === 'ordinary PR') github.run.event = 'pull_request'
    else if (failure === 'different SHA') github.run.head_sha = 'c'.repeat(40)
    else github.jobs[1].steps[3].conclusion = failure
    github.save()
    const result = value.build()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Pages deployment blocked')
    expect(readFileSync(value.log, 'utf8')).not.toContain('build:pages-frontend')
    expect(existsSync(join(value.cwd, 'dist-pages'))).toBe(false)
  })

  it('refuses build output that identifies another source commit', () => {
    const value = fixture()
    githubFixture(value)
    value.env.PAGES_TEST_BUILD_ID = 'c'.repeat(40)
    const result = value.build()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Pages artifact does not match the verified candidate')
  })

  it.each(['verification', 'build'])('refuses source changes during %s before an artifact can be published', (phase) => {
    const value = fixture()
    githubFixture(value)
    if (phase === 'verification') {
      value.git('commit', '--allow-empty', '-m', 'later commit')
      value.env.PAGES_TEST_CHECKOUT = value.git('rev-parse', 'HEAD')
      value.git('checkout', '--detach', value.sha)
    } else value.env.PAGES_TEST_CHANGE_SOURCE = '1'
    const result = value.build()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(phase === 'verification' ? 'Candidate checkout mismatch' : 'Candidate checkout contains uncommitted sources')
    if (phase === 'verification') expect(readFileSync(value.log, 'utf8')).not.toContain('build:pages-frontend')
  })

  it('cannot publish a stale Pages artifact when the current build produces no output', () => {
    const value = fixture()
    githubFixture(value)
    mkdirSync(join(value.cwd, 'dist-pages'))
    writeFileSync(join(value.cwd, 'dist-pages/frontend-build.json'), JSON.stringify({ format: 1, gameBuildId: value.sha, basePath: '/' }))
    value.env.PAGES_TEST_NO_OUTPUT = '1'
    const result = value.build()
    expect(result.status).toBe(1)
    expect(existsSync(join(value.cwd, 'dist-pages/frontend-build.json'))).toBe(false)
  })
})

describe.each(['release', 'workflow_dispatch'] as const)('Pages deployment workflow boundary (%s)', (event) => {
  it.each(['missing', 'failure', 'cancelled', 'skipped', 'configuration'])('does not upload or deploy a candidate with %s evidence', (failure) => {
    const value = fixture()
    const github = githubFixture(value)
    if (failure === 'missing') github.jobs.pop()
    else if (failure === 'configuration') github.jobs[0].steps[1].name = github.jobs[0].steps[1].name.replace(/ [a-f0-9]{64} /, ` ${'c'.repeat(64)} `)
    else github.jobs[1].steps[3].conclusion = failure
    github.save()
    value.env.GITHUB_REF = 'main'
    const result = runWorkflow(value, event)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Pages deployment blocked')
    expect(existsSync(join(value.cwd, 'output/upload.json'))).toBe(false)
    expect(existsSync(join(value.cwd, 'output/deployment.json'))).toBe(false)
  }, 20_000)

  it('deploys the fixed candidate even when its branch and release tag move', () => {
    const value = fixture()
    githubFixture(value)
    value.git('tag', 'v1.0.0', value.sha)
    value.git('commit', '--allow-empty', '-m', 'later source')
    const later = value.git('rev-parse', 'HEAD')
    value.git('tag', '--force', 'v1.0.0', later)
    value.git('update-ref', 'refs/heads/main', value.sha)
    value.env.GITHUB_REF = event === 'release' ? 'refs/tags/v1.0.0' : 'refs/heads/main'
    value.env.PAGES_TEST_MOVE_REF = later
    const result = runWorkflow(value, event)
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(readFileSync(join(value.cwd, 'output/deployment.json'), 'utf8'))).toEqual({ format: 1, gameBuildId: value.sha, basePath: '/' })
    expect(readFileSync(join(value.cwd, 'dist-pages/index.html'), 'utf8').trim()).toBe(value.sha)
    expect(value.git('rev-parse', 'main')).toBe(later)
    expect(value.git('rev-parse', 'v1.0.0')).toBe(later)
    expect(value.git('rev-parse', 'HEAD')).toBe(value.sha)
  }, 20_000)

  it.each(['build failure', 'artifact mismatch', 'changed source'])('does not upload or deploy after %s', (failure) => {
    const value = fixture()
    githubFixture(value)
    value.env.GITHUB_REF = 'main'
    if (failure === 'build failure') value.env.PAGES_TEST_BUILD_FAIL = '1'
    else if (failure === 'artifact mismatch') value.env.PAGES_TEST_BUILD_ID = 'c'.repeat(40)
    else value.env.PAGES_TEST_CHANGE_SOURCE = '1'
    const result = runWorkflow(value, event)
    expect(result.status).toBe(1)
    expect(existsSync(join(value.cwd, 'output/upload.json'))).toBe(false)
    expect(existsSync(join(value.cwd, 'output/deployment.json'))).toBe(false)
  }, 20_000)
})
