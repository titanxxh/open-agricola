import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { candidateRepository, finalSnapshotMetadata } from './_helpers/candidate-provenance'

const repoRoot = resolve(__dirname, '../..')
const cli = join(repoRoot, 'scripts/ci/candidate-verification.ts')
const temporary: string[] = []
afterEach(() => { for (const cwd of temporary.splice(0)) rmSync(cwd, { recursive: true, force: true }) })

function fixture(forgedProducer = false) {
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
  if (forgedProducer) {
    writeFileSync(join(cwd, 'scripts/ci/verification-tasks.ts'), 'export const FULL_TASK_IDS = []\n')
    writeFileSync(join(cwd, 'scripts/ci/candidate-verification.ts'), "import { writeFileSync } from 'node:fs'\nwriteFileSync('FORGED_PRODUCER_EXECUTED', 'yes')\nconsole.log(JSON.stringify({ status: 'passed' }))\n")
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { 'check:architecture': 'true', build: 'true', 'test:fast': 'true' } }))
  }
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
  return { cwd, sha, run, log, bin, env, git }
}

function githubFixture(value: ReturnType<typeof fixture>, failedTask = '', repository = candidateRepository) {
  const configuration = JSON.parse(value.run('manifest', '--sha', value.sha).stdout).configuration
  const tasks = ['quality', 'fast', 'slow', 'build', 'chromium-1', 'chromium-2', 'chromium-3', 'chromium-4', 'browser-sandbox', 'webkit']
  const step = (name: string) => ({ name, status: 'completed', conclusion: 'success' })
  const workflow = { id: 100, path: '.github/workflows/candidate-verification.yml' }
  const run = { id: 1, workflow_id: 100, path: workflow.path, event: 'workflow_dispatch', head_sha: value.sha,
    repository: { ...repository }, head_repository: { ...repository }, status: 'completed', run_attempt: 1,
    created_at: '2026-10-30T00:00:00Z', updated_at: '2026-10-30T00:15:00Z', html_url: 'https://github.com/titanxxh/open-agricola/actions/runs/1' }
  const jobs = tasks.map((task, index) => ({
    id: index + 2, run_id: 1, run_attempt: 1, name: `candidate / ${task} / ${configuration}`,
    started_at: '2026-10-30T00:05:00Z', completed_at: '2026-10-30T00:10:00Z',
    status: 'completed', conclusion: task === failedTask ? 'failure' : 'success', html_url: run.html_url,
    steps: ['Checkout candidate', 'Install dependencies', 'Verify candidate checkout', 'Execute verification task', 'Install browsers'].map(step),
  }))
  jobs.unshift({ id: 1, run_id: 1, run_attempt: 1, name: 'candidate-manifest', status: 'completed', conclusion: 'success', html_url: run.html_url,
    started_at: '2026-10-30T00:00:00Z', completed_at: '2026-10-30T00:01:00Z',
    steps: [step('Generate candidate manifest'), step(`Candidate manifest / ${value.sha} / ${configuration} / ${tasks.join(',')}`)] })
  const prefix = `repos/${repository.full_name}`
  writeFileSync(join(value.cwd, 'github-responses.json'), JSON.stringify({
    ...finalSnapshotMetadata(value.sha, value.sha, repository),
    [`${prefix}/actions/workflows/candidate-verification.yml`]: workflow,
    [`${prefix}/actions/workflows/100/runs?head_sha=${value.sha}&event=workflow_dispatch&per_page=100`]: { workflow_runs: [run] },
    [`${prefix}/actions/runs/1/jobs?filter=all&per_page=100`]: { jobs },
    [`${prefix}/commits/main`]: { sha: value.sha },
  }))
  writeFileSync(join(value.bin, 'gh'), `#!/usr/bin/env node\nconst fs = require('node:fs'); const path = require('node:path'); const args = process.argv.slice(2); const endpoint = args[1]; fs.appendFileSync(path.join(process.cwd(), 'bin/github-reads.jsonl'), JSON.stringify(args) + '\\n'); if (args.includes('POST')) { fs.appendFileSync(path.join(process.cwd(), 'github-mutations.jsonl'), fs.readFileSync(0, 'utf8') + '\\n'); } else { const responses = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'github-responses.json'), 'utf8')); const response = responses[endpoint]; if (!response) { console.error('Unexpected GitHub endpoint: ' + endpoint); process.exit(1); } if (args.includes('--paginate')) { const key = args[args.indexOf('--jq') + 1].split('[]')[0].slice(1); for (const item of key ? response[key] : response) console.log(JSON.stringify(item)); } else console.log(JSON.stringify(response)); }\n`)
  chmodSync(join(value.bin, 'gh'), 0o755)
  return { run, jobs, configuration }
}

function replaceMetadata(value: ReturnType<typeof fixture>, changes: Record<string, unknown>) {
  const file = join(value.cwd, 'github-responses.json')
  const metadata: unknown = JSON.parse(readFileSync(file, 'utf8'))
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) throw new Error('Invalid fixture metadata')
  writeFileSync(file, JSON.stringify({ ...metadata, ...changes }))
}

const prefix = 'repos/titanxxh/open-agricola'
const mergedPr = (sha: string) => ({ number: 1, state: 'closed', merged: true, merged_at: '2026-10-30T00:00:00Z',
  merge_commit_sha: sha, base: { ref: 'main', repo: { ...candidateRepository } } })

describe('candidate verification public CLI', () => {
  it('checks and requests an explicitly chosen fork using its own native repository ID and protected-main snapshot', () => {
    const value = fixture()
    const fork = { id: 987654321, full_name: 'example/open-agricola-fork' }
    githubFixture(value, '', fork)
    const checked = value.run('check', '--sha', value.sha, '--repository', fork.full_name)
    expect(checked.status, checked.stderr).toBe(0)
    expect(JSON.parse(checked.stdout)).toMatchObject({ status: 'passed', repository: fork.full_name, sha: value.sha })
    const requested = value.run('request', '--sha', value.sha, '--ref', 'main', '--tasks', 'fast', '--repository', fork.full_name)
    expect(requested.status, requested.stderr).toBe(0)
    expect(JSON.parse(requested.stdout)).toMatchObject({ status: 'requested', repository: fork.full_name })
  }, 30_000)

  it('rejects an unmerged writer with no-op producers despite matching successful job names and configuration', () => {
    const value = fixture(true)
    githubFixture(value)
    const file = join(value.cwd, 'github-responses.json')
    const responses = JSON.parse(readFileSync(file, 'utf8'))
    responses[`repos/titanxxh/open-agricola/commits/${value.sha}/pulls?per_page=100`] = []
    writeFileSync(file, JSON.stringify(responses))

    const result = value.run('check', '--sha', value.sha, '--repository', 'titanxxh/open-agricola')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Candidate is ineligible for formal verification')
    expect(existsSync(join(value.cwd, 'FORGED_PRODUCER_EXECUTED'))).toBe(false)
    expect(existsSync(join(value.cwd, 'github-mutations.jsonl'))).toBe(false)
  })

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

  it('checks trusted GitHub evidence with native Node and no tsx loader', () => {
    const value = fixture()
    githubFixture(value)
    const result = spawnSync(process.execPath, [cli, 'check', '--sha', value.sha, '--repository', 'titanxxh/open-agricola'], {
      cwd: value.cwd, env: value.env, encoding: 'utf8', timeout: 15_000,
    })
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout).status).toBe('passed')
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
    value.git('commit', '--allow-empty', '-m', 'main advances')
    replaceMetadata(value, { [`${prefix}/git/ref/heads/main`]: { ref: 'refs/heads/main', object: { type: 'commit', sha: value.git('rev-parse', 'HEAD') } } })
    const result = value.run('request', '--sha', value.sha, '--ref', 'main', '--repository', 'titanxxh/open-agricola')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Dispatch ref no longer points to the fixed candidate SHA')
    expect(existsSync(join(value.cwd, 'github-mutations.jsonl'))).toBe(false)
  })

  it.each(['repository ID', 'default branch', 'wrong base', 'base repository', 'open test merge', 'missing merged time', 'missing association', 'main tag'])('rejects ineligible %s before interpreting producer evidence or dispatching', name => {
    const value = fixture()
    githubFixture(value)
    const pr: Record<string, unknown> = mergedPr(value.sha)
    const changes: Record<string, unknown> = {}
    if (name === 'repository ID') changes[prefix] = { ...candidateRepository, id: 999, default_branch: 'main' }
    if (name === 'default branch') changes[prefix] = { ...candidateRepository, default_branch: 'other' }
    if (name === 'wrong base') pr.base = { ref: 'other', repo: { ...candidateRepository } }
    if (name === 'base repository') pr.base = { ref: 'main', repo: { ...candidateRepository, id: 999 } }
    if (name === 'open test merge') { pr.state = 'open'; pr.merged = false; pr.merged_at = null }
    if (name === 'missing merged time') pr.merged_at = null
    if (name === 'missing association') changes[`${prefix}/commits/${value.sha}/pulls?per_page=100`] = []
    if (name === 'main tag') changes[`${prefix}/git/ref/heads/main`] = { ref: 'refs/tags/main', object: { type: 'commit', sha: value.sha } }
    changes[`${prefix}/pulls/1`] = pr
    replaceMetadata(value, changes)
    const result = value.run('request', '--sha', value.sha, '--ref', 'main', '--repository', 'titanxxh/open-agricola')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Candidate is ineligible for formal verification')
    expect(existsSync(join(value.cwd, 'github-mutations.jsonl'))).toBe(false)
    expect(readFileSync(join(value.bin, 'github-reads.jsonl'), 'utf8')).not.toContain('/actions/')
  })

  it.each(['pull_request', 'non_fast_forward', 'deletion', 'required_linear_history'])('rejects loss of effective main protection %s', missing => {
    const value = fixture()
    githubFixture(value)
    replaceMetadata(value, { [`${prefix}/rules/branches/main?per_page=100`]:
      ['pull_request', 'non_fast_forward', 'deletion', 'required_linear_history'].filter(type => type !== missing).map(type => ({ type })) })
    const result = value.run('check', '--sha', value.sha, '--repository', 'titanxxh/open-agricola')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Main must require pull requests and linear history, and prevent force updates and deletion')
    expect(existsSync(join(value.cwd, 'github-mutations.jsonl'))).toBe(false)
  })

  it.each(['failure', 'cancelled'])('does not reuse older success when a newer %s producer lacks head repository identity', conclusion => {
    const value = fixture()
    const metadata = githubFixture(value)
    replaceMetadata(value, {
      [`${prefix}/actions/workflows/100/runs?head_sha=${value.sha}&event=workflow_dispatch&per_page=100`]: {
        workflow_runs: [metadata.run, { ...metadata.run, id: 2, conclusion, head_repository: undefined,
          created_at: '2026-10-30T01:00:00Z', updated_at: '2026-10-30T01:15:00Z' }],
      },
      [`${prefix}/actions/runs/2/jobs?filter=all&per_page=100`]: { jobs: [] },
    })
    const result = value.run('check', '--sha', value.sha, '--repository', 'titanxxh/open-agricola')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Invalid GitHub evidence')
    expect(existsSync(join(value.cwd, 'github-mutations.jsonl'))).toBe(false)
  })

  it('accepts active classic protection when no effective ruleset supplies the mandatory rules', () => {
    const value = fixture()
    githubFixture(value)
    replaceMetadata(value, { [`${prefix}/rules/branches/main?per_page=100`]: [],
      [`${prefix}/branches/main/protection`]: { required_pull_request_reviews: { required_approving_review_count: 1 },
        allow_force_pushes: { enabled: false }, allow_deletions: { enabled: false }, required_linear_history: { enabled: true } } })
    const result = value.run('check', '--sha', value.sha, '--repository', 'titanxxh/open-agricola')
    expect(result.status, result.stderr).toBe(0)
  })

  it('rejects an intermediate rebased ancestor instead of treating association as final integration', () => {
    const value = fixture()
    githubFixture(value)
    value.git('commit', '--allow-empty', '-m', 'final rebased integration')
    const final = value.git('rev-parse', 'HEAD')
    replaceMetadata(value, { [`${prefix}/git/ref/heads/main`]: { ref: 'refs/heads/main', object: { type: 'commit', sha: final } },
      [`${prefix}/pulls/1`]: { ...mergedPr(value.sha), merge_commit_sha: final } })
    const result = value.run('check', '--sha', value.sha, '--repository', 'titanxxh/open-agricola')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('final merged pull request snapshot')
  })

  it('accepts an older final snapshot after main and its verification implementation advance', () => {
    const value = fixture()
    githubFixture(value)
    writeFileSync(join(value.cwd, 'scripts/ci/verification-tasks.ts'), 'export const changedProducer = true\n')
    value.git('add', '--', 'scripts/ci/verification-tasks.ts', ':(exclude)docs/superpowers/**')
    value.git('commit', '-m', 'advance producer on main')
    replaceMetadata(value, { [`${prefix}/git/ref/heads/main`]: { ref: 'refs/heads/main', object: { type: 'commit', sha: value.git('rev-parse', 'HEAD') } } })
    const result = value.run('check', '--sha', value.sha, '--repository', 'titanxxh/open-agricola')
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout).sha).toBe(value.sha)
  })

  it('ignores a tag named main when selecting the default formal dispatch branch', () => {
    const value = fixture()
    githubFixture(value)
    replaceMetadata(value, { [`${prefix}/commits/main`]: { sha: 'c'.repeat(40) } })
    const result = value.run('request', '--sha', value.sha, '--ref', 'main', '--tasks', 'fast', '--repository', 'titanxxh/open-agricola')
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(readFileSync(join(value.cwd, 'github-mutations.jsonl'), 'utf8')).inputs).toEqual({ candidate_sha: value.sha, tasks: 'fast' })
    expect(readFileSync(join(value.bin, 'github-reads.jsonl'), 'utf8')).not.toContain('/commits/main')
  })

  it('paginates associations and freshly checks each PR before accepting a later matching one', () => {
    const value = fixture()
    githubFixture(value)
    replaceMetadata(value, { [`${prefix}/commits/${value.sha}/pulls?per_page=100`]: [{ number: 1 }, { number: 2 }],
      [`${prefix}/pulls/1`]: { ...mergedPr(value.sha), merged: false, state: 'open' },
      [`${prefix}/pulls/2`]: { ...mergedPr(value.sha), number: 2 } })
    const result = value.run('check', '--sha', value.sha, '--repository', 'titanxxh/open-agricola')
    expect(result.status, result.stderr).toBe(0)
    const calls: unknown[] = readFileSync(join(value.bin, 'github-reads.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
    expect(calls).toContainEqual(['api', `${prefix}/commits/${value.sha}/pulls?per_page=100`, '-H', 'Accept: application/vnd.github+json', '--paginate', '--jq', '.[] | @json'])
    expect(calls).toContainEqual(['api', `${prefix}/pulls/2`, '-H', 'Accept: application/vnd.github+json'])
  })

  it('requires actual Git reachability from the explicitly resolved main commit', () => {
    const value = fixture()
    githubFixture(value)
    value.git('checkout', '--orphan', 'unrelated-main')
    value.git('commit', '-m', 'unrelated main lineage')
    replaceMetadata(value, { [`${prefix}/git/ref/heads/main`]: { ref: 'refs/heads/main', object: { type: 'commit', sha: value.git('rev-parse', 'HEAD') } } })
    const result = value.run('check', '--sha', value.sha, '--repository', 'titanxxh/open-agricola')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('not reachable from the explicitly resolved main commit')
    expect(existsSync(join(value.cwd, 'github-mutations.jsonl'))).toBe(false)
  })

  it('checks the raw main Git object instead of trusting a commit label on an annotated tag', () => {
    const value = fixture()
    githubFixture(value)
    value.git('tag', '-a', 'tag-object', '-m', 'not a commit object')
    replaceMetadata(value, { [`${prefix}/git/ref/heads/main`]: { ref: 'refs/heads/main', object: { type: 'commit', sha: value.git('rev-parse', 'tag-object') } } })
    const result = value.run('check', '--sha', value.sha, '--repository', 'titanxxh/open-agricola')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('exact Git commit objects')
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
