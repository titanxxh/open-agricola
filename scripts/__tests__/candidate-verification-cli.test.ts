import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../..')
const cli = join(repoRoot, 'scripts/ci/candidate-verification.ts')
const temporary: string[] = []
afterEach(() => { for (const cwd of temporary.splice(0)) rmSync(cwd, { recursive: true, force: true }) })

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'candidate-cli-'))
  temporary.push(cwd)
  mkdirSync(join(cwd, 'scripts/ci'), { recursive: true })
  mkdirSync(join(cwd, '.github/workflows'), { recursive: true })
  cpSync(join(repoRoot, 'scripts/ci'), join(cwd, 'scripts/ci'), { recursive: true })
  cpSync(join(repoRoot, '.github/workflows/candidate-verification.yml'), join(cwd, '.github/workflows/candidate-verification.yml'))
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: {
    'check:architecture': 'pnpm run lint && pnpm run check:test-project-coverage && pnpm run check:architecture-tests && pnpm run check:dependencies',
  } }))
  writeFileSync(join(cwd, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
  writeFileSync(join(cwd, 'source.txt'), 'candidate\n')
  writeFileSync(join(cwd, '.gitignore'), 'bin/\ncommands.jsonl\ngithub-responses.json\ngithub-mutations.jsonl\n')
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-b', 'main')
  git('config', 'user.name', 'Candidate Test')
  git('config', 'user.email', 'candidate@example.test')
  git('add', '--all', '--', '.', ':(exclude)docs/superpowers/**')
  git('commit', '-m', 'candidate fixture')
  const sha = git('rev-parse', 'HEAD')
  const bin = join(cwd, 'bin')
  mkdirSync(bin)
  const log = join(cwd, 'commands.jsonl')
  writeFileSync(join(bin, 'pnpm'), `#!/usr/bin/env node\nimport('node:fs').then(fs => { fs.appendFileSync(process.env.COMMAND_LOG, JSON.stringify(process.argv.slice(2)) + '\\n'); if (process.env.FAIL_BUILD === '1' && process.argv[3] === 'build') process.exitCode = 7 })\n`)
  chmodSync(join(bin, 'pnpm'), 0o755)
  const env: NodeJS.ProcessEnv = { ...process.env, GITHUB_SHA: sha, GITHUB_OUTPUT: '', COMMAND_LOG: log, PATH: bin + delimiter + process.env.PATH }
  const run = (...args: string[]) => spawnSync(join(repoRoot, 'node_modules/.bin/tsx'), [cli, ...args], { cwd, encoding: 'utf8', env })
  return { cwd, sha, run, log, bin, env }
}

function githubFixture(value: ReturnType<typeof fixture>, failedTask = '') {
  const configuration = JSON.parse(value.run('manifest', '--sha', value.sha).stdout).configuration
  const tasks = ['quality', 'fast', 'slow', 'build', 'chromium-1', 'chromium-2', 'chromium-3', 'chromium-4', 'browser-sandbox', 'webkit']
  const step = (name: string) => ({ name, status: 'completed', conclusion: 'success' })
  const workflow = { id: 100, path: '.github/workflows/candidate-verification.yml' }
  const run = { id: 1, workflow_id: 100, path: workflow.path, event: 'workflow_dispatch', head_sha: value.sha,
    repository: { full_name: 'titanxxh/open-agricola' }, status: 'completed', run_attempt: 1,
    created_at: '2026-10-30T00:00:00Z', html_url: 'https://github.com/titanxxh/open-agricola/actions/runs/1' }
  const jobs = tasks.map((task, index) => ({
    id: index + 2, run_id: 1, run_attempt: 1, name: `candidate / ${task} / ${configuration}`,
    status: 'completed', conclusion: task === failedTask ? 'failure' : 'success', html_url: run.html_url,
    steps: ['Checkout candidate', 'Install dependencies', 'Verify candidate checkout', 'Execute verification task', 'Install browsers'].map(step),
  }))
  jobs.unshift({ id: 1, run_id: 1, run_attempt: 1, name: 'candidate-manifest', status: 'completed', conclusion: 'success', html_url: run.html_url,
    steps: [step('Generate candidate manifest'), step(`Candidate manifest / ${value.sha} / ${configuration} / ${tasks.join(',')}`)] })
  const prefix = 'repos/titanxxh/open-agricola'
  writeFileSync(join(value.cwd, 'github-responses.json'), JSON.stringify({
    [`${prefix}/actions/workflows/candidate-verification.yml`]: workflow,
    [`${prefix}/actions/workflows/100/runs?head_sha=${value.sha}&event=workflow_dispatch&per_page=100`]: { workflow_runs: [run] },
    [`${prefix}/actions/runs/1/jobs?filter=all&per_page=100`]: { jobs },
    [`${prefix}/commits/main`]: { sha: value.sha },
  }))
  writeFileSync(join(value.bin, 'gh'), `#!/usr/bin/env node\nconst fs = require('node:fs'); const path = require('node:path'); const args = process.argv.slice(2); const endpoint = args[1]; if (args.includes('POST')) { fs.appendFileSync(path.join(process.cwd(), 'github-mutations.jsonl'), fs.readFileSync(0, 'utf8') + '\\n'); } else { const responses = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'github-responses.json'), 'utf8')); const response = responses[endpoint]; if (!response) { console.error('Unexpected GitHub endpoint: ' + endpoint); process.exit(1); } if (args.includes('--paginate')) { const key = args[args.indexOf('--jq') + 1].split('[]')[0].slice(1); for (const item of response[key]) console.log(JSON.stringify(item)); } else console.log(JSON.stringify(response)); }\n`)
  chmodSync(join(value.bin, 'gh'), 0o755)
}

describe('candidate verification public CLI', () => {
  it('binds the actual checkout and complete task selection in its manifest', () => {
    const { sha, run } = fixture()
    const result = run('manifest', '--sha', sha)
    expect(result.status).toBe(0)
    const manifest = JSON.parse(result.stdout)
    expect(manifest.sha).toBe(sha)
    expect(manifest.configuration).toMatch(/^[a-f0-9]{64}$/)
    expect(manifest.matrix.task).toEqual([
      'quality', 'fast', 'slow', 'build', 'chromium-1', 'chromium-2', 'chromium-3', 'chromium-4', 'browser-sandbox', 'webkit',
    ])
    expect(manifest.binding).toContain(sha)
  })

  it('exports the canonical selected task IDs for reusable workflow completion', () => {
    const value = fixture()
    const output = join(value.bin, 'github-output')
    value.env.GITHUB_OUTPUT = output
    const result = value.run('manifest', '--sha', value.sha, '--tasks', 'build,quality')
    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(output, 'utf8')).toContain('\ntasks=quality,build\n')
    expect(JSON.parse(result.stdout).matrix.task).toEqual(['quality', 'build'])
  })

  it('does not allow a requested SHA to stand in for a different actual checkout', () => {
    const { run } = fixture()
    const result = run('manifest', '--sha', 'c'.repeat(40))
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Candidate checkout mismatch')
  })

  it('rejects uncommitted source files that can affect the candidate build', () => {
    const { cwd, sha, run } = fixture()
    writeFileSync(join(cwd, 'new-source.ts'), 'export const affectsBuild = true\n')
    const result = run('manifest', '--sha', sha)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Candidate checkout contains uncommitted sources')
  })

  it('executes the selected build task through process boundaries', () => {
    const { sha, run, log } = fixture()
    expect(run('run-task', 'build', '--sha', sha).status).toBe(0)
    expect(readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line))).toEqual([
      ['run', 'build'], ['run', 'build:replay-viewer'], ['run', 'check:bundle-size'],
    ])
  })

  it('stops the selected task at a failed command', () => {
    const { sha, run, log, env } = fixture()
    env.FAIL_BUILD = '1'
    const result = run('run-task', 'build', '--sha', sha)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Candidate task build failed')
    expect(readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line))).toEqual([['run', 'build']])
  })

  it('queries GitHub evidence and returns a successful formal candidate result', () => {
    const value = fixture()
    githubFixture(value)
    const result = value.run('check', '--sha', value.sha, '--repository', 'titanxxh/open-agricola', '--json')
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).status).toBe('passed')
    expect(JSON.parse(result.stdout).tasks).toHaveLength(10)
  })

  it('returns a failing CLI status when GitHub reports a required task failure', () => {
    const value = fixture()
    githubFixture(value, 'webkit')
    const result = value.run('check', '--sha', value.sha, '--repository', 'titanxxh/open-agricola')
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout).tasks.at(-1).status).toBe('blocked')
  })

  it('dispatches the fixed candidate and selected retry task through the GitHub boundary', () => {
    const value = fixture()
    githubFixture(value)
    const result = value.run('request', '--sha', value.sha, '--ref', 'main', '--tasks', 'webkit', '--repository', 'titanxxh/open-agricola')
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).status).toBe('requested')
    expect(JSON.parse(readFileSync(join(value.cwd, 'github-mutations.jsonl'), 'utf8'))).toEqual({
      ref: 'main', inputs: { candidate_sha: value.sha, tasks: 'webkit' },
    })
  })

  it('does not dispatch when the supplied ref has moved beyond the fixed candidate', () => {
    const value = fixture()
    githubFixture(value)
    const responses = JSON.parse(readFileSync(join(value.cwd, 'github-responses.json'), 'utf8'))
    responses['repos/titanxxh/open-agricola/commits/main'] = { sha: 'c'.repeat(40) }
    writeFileSync(join(value.cwd, 'github-responses.json'), JSON.stringify(responses))
    const result = value.run('request', '--sha', value.sha, '--ref', 'main', '--repository', 'titanxxh/open-agricola')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Dispatch ref no longer points to the fixed candidate SHA')
    expect(existsSync(join(value.cwd, 'github-mutations.jsonl'))).toBe(false)
  })

  it('reuses architecture declarations without rerunning tests already owned by fast and slow', () => {
    const { sha, run, log } = fixture()
    expect(run('run-task', 'quality', '--sha', sha).status).toBe(0)
    expect(readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line))).toEqual([
      ['run', 'lint'], ['run', 'check:dependencies'], ['run', 'lint:i18n'],
    ])
  })

  it('invalidates the configuration when verification inputs change in a new candidate', () => {
    const { cwd, sha, run } = fixture()
    const original = JSON.parse(run('manifest', '--sha', sha).stdout).configuration
    writeFileSync(join(cwd, 'pnpm-lock.yaml'), 'lockfileVersion: 10\n')
    execFileSync('git', ['add', '--', 'pnpm-lock.yaml', ':(exclude)docs/superpowers/**'], { cwd })
    execFileSync('git', ['commit', '-m', 'change verification dependency'], { cwd, stdio: 'pipe' })
    const changedSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
    const result = spawnSync(join(repoRoot, 'node_modules/.bin/tsx'), [cli, 'manifest', '--sha', changedSha], {
      cwd, encoding: 'utf8', env: { ...process.env, GITHUB_SHA: changedSha, GITHUB_OUTPUT: '' },
    })
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).configuration).not.toBe(original)
  })
})
