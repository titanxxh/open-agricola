import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { executeRepositoryPlan, routinePlanManifest } from '../ci/scoped-verification'
import { taskCommands } from '../ci/verification-tasks'
import type { VerificationPlan } from '../ci/verification-plan'

const identity = {
  baseRef: 'main', headRef: 'HEAD', baseSha: '1'.repeat(40), mergeBaseSha: '1'.repeat(40),
  headSha: '2'.repeat(40), testedSha: '2'.repeat(40), sourceFingerprint: '3'.repeat(64),
}

describe('routine verification manifest', () => {
  it.each([
    'hosted-password-login', 'oauth-onboarding', 'workshop-browser-card-tests',
  ])('installs both engines for the embedded browser launches in %s', file => {
    const plan: VerificationPlan = {
      schemaVersion: 1, status: 'planned', mode: 'scoped', identity,
      changes: [], inventory: { vitest: [], browser: [] }, selections: [], expansionReasons: [], wideningReasons: [],
      checks: [{ kind: 'browser', browser: 'chromium', files: [`e2e-tests/${file}.spec.ts`], grep: null }],
    }
    expect(routinePlanManifest(plan).browsers).toBe('chromium webkit')
  })
})

const executionDirectories: string[] = []
afterEach(() => {
  executionDirectories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true }))
  vi.unstubAllEnvs()
})

function executionFixture(change: 'card' | 'script-database' | 'script-pure' | 'script-dynamic' | 'documentation' = 'card') {
  vi.stubEnv('GITHUB_SHA', '')
  vi.stubEnv('GITHUB_OUTPUT', '')
  vi.stubEnv('GITHUB_STEP_SUMMARY', '')
  const cwd = mkdtempSync(join(tmpdir(), 'scoped-execution-'))
  executionDirectories.push(cwd)
  const write = (file: string, contents: string) => {
    mkdirSync(dirname(join(cwd, file)), { recursive: true })
    writeFileSync(join(cwd, file), contents)
  }
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  for (const directory of ['shared', 'server', 'client', 'scripts', 'tests', 'e2e-tests', 'replay-viewer']) write(`${directory}/.keep`, '')
  write('.gitignore', 'output/\n')
  write('shared/cards/A/A029_AleBenches.ts', "export const A029_AleBenches = defineMinorCard({ meta: { id: 'A029_AleBenches', cost: { wood: 1 } } })\n")
  write('shared/cards/__tests__/A29_AleBenches.test.ts', "import '../A/A029_AleBenches'\n")
  write('server/__tests__/cross-card-session.test.ts', "import '../../shared/cards/A/A029_AleBenches'\n")
  write('server/__tests__/A029_AleBenches-session.test.ts', "import '../../shared/cards/A/A029_AleBenches'\n")
  for (const name of ['card-localization', 'choice-previews', 'farm-card-targets', 'frontend-browser-scenario-matrix']) {
    write(`e2e-tests/${name}.spec.ts`, '// generic card consumer\n')
  }
  write('README.md', 'Guide\n')
  if (change === 'documentation') write('scripts/__tests__/docs-budget.test.ts', "import { readFileSync } from 'node:fs'\nconst bytes = readFileSync('README.md', 'utf8')\n")
  if (change.startsWith('script-')) {
    const contents = change === 'script-database' ? "import { createDatabase } from './_helpers/import-fixture'\ncreateDatabase()\n"
      : change === 'script-dynamic' ? 'await import(inputPath)\n' : 'const formatted = true\n'
    write('scripts/__tests__/script-consumer.test.ts', contents)
    if (change === 'script-database') {
      write('scripts/__tests__/_helpers/import-fixture.ts', "import { createTestDatabase } from '../../../server/__tests__/_helpers/postgres'\nexport const createDatabase = createTestDatabase\n")
      write('server/__tests__/_helpers/postgres.ts', 'export const createTestDatabase = () => ({})\n')
    }
  }
  write('package.json', '{}\n')
  git('init', '-q', '--template=', '-b', 'main')
  git('add', '--', '.', ':(exclude)docs/superpowers/**')
  git('-c', 'user.name=Scope', '-c', 'user.email=scope@example.test', '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'baseline')
  git('checkout', '-qb', 'feature')
  if (change === 'card') write('shared/cards/A/A029_AleBenches.ts', "export const A029_AleBenches = defineMinorCard({ meta: { id: 'A029_AleBenches', cost: { wood: 2 } } })\n")
  else if (change === 'documentation') write('README.md', 'Updated guide\n')
  else writeFileSync(join(cwd, 'scripts/__tests__/script-consumer.test.ts'), readFileSync(join(cwd, 'scripts/__tests__/script-consumer.test.ts'), 'utf8') + '// regression assertion\n')
  git('add', '--', '.', ':(exclude)docs/superpowers/**')
  git('-c', 'user.name=Scope', '-c', 'user.email=scope@example.test', '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-qm', change)
  const output = join(cwd, 'output/verification/scoped-result.json')
  return { cwd, output, execute: (run: (command: string, args: string[], cwd: string) => number,
    partition: 'units-1' | 'units-2' | 'units-3' | 'browser-1' | 'browser-2' | 'browser-3' | 'browser-4' = 'units-1') =>
    executeRepositoryPlan({ cwd, base: 'main', head: 'HEAD', partition, output }, run) }
}

function browserFixture() {
  vi.stubEnv('GITHUB_SHA', '')
  vi.stubEnv('GITHUB_OUTPUT', '')
  const summary = join(mkdtempSync(join(tmpdir(), 'routine-summary-')), 'summary.md')
  vi.stubEnv('GITHUB_STEP_SUMMARY', summary)
  const cwd = mkdtempSync(join(tmpdir(), 'scoped-browser-'))
  executionDirectories.push(cwd)
  const write = (file: string, contents: string) => {
    mkdirSync(dirname(join(cwd, file)), { recursive: true })
    writeFileSync(join(cwd, file), contents)
  }
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] as const })
  for (const directory of ['shared', 'server', 'client', 'scripts', 'tests', 'e2e-tests', 'replay-viewer']) write(`${directory}/.keep`, '')
  write('.gitignore', 'output/\n')
  write('client/components/board/FarmBoard.tsx', 'export const board = 1\n')
  write('client/components/board/__tests__/FarmBoard.test.tsx', "import '../FarmBoard'\n")
  write('package.json', '{}\n')
  for (let index = 0; index < 10; index += 1) write(`e2e-tests/pad-${index}.spec.ts`, '// not selected\n')
  for (const name of ['pack-a', 'pack-b', 'pack-c', 'pack-d']) {
    write(`e2e-tests/${name}.spec.ts`, '// @covers client/components/board\n')
  }
  write('e2e-tests/pack-e.spec.ts', '// @covers client/components/board\nthrow new Error("Build the production frontend with pnpm run build:hosted-frontend before this spec")\n')
  git('init', '-q', '--template=', '-b', 'main')
  git('add', '--', '.', ':(exclude)docs/superpowers/**')
  git('-c', 'user.name=Scope', '-c', 'user.email=scope@example.test', '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'baseline')
  git('checkout', '-qb', 'feature')
  write('client/components/board/FarmBoard.tsx', 'export const board = 2\n')
  git('add', '--', '.', ':(exclude)docs/superpowers/**')
  git('-c', 'user.name=Scope', '-c', 'user.email=scope@example.test', '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'frontend')
  const output = join(cwd, 'output/verification/scoped-result.json')
  return {
    cwd, summary, output,
    execute: (run: (command: string, args: string[], cwd: string) => number, partition: 'browser-1' | 'browser-2') =>
      executeRepositoryPlan({ cwd, base: 'main', head: 'HEAD', partition, output }, run),
  }
}

function writeRunnerReport(cwd: string, args: string[], names?: string[]) {
  const argument = args.find(arg => arg.startsWith('--outputFile.json='))
  if (!argument) return
  const files = names ?? args.filter(arg => /\.test\.[cm]?[jt]sx?$/.test(arg))
  writeFileSync(argument.slice('--outputFile.json='.length), JSON.stringify({
    success: true, numFailedTests: 0, numFailedTestSuites: 0, numPendingTestSuites: 0,
    testResults: files.map(file => ({ name: join(cwd, file), status: 'passed', assertionResults: [{ status: 'passed' }] })),
  }))
}

describe('scoped check execution', () => {
  it.each(['script-database', 'script-dynamic'] as const)('prepares services once for an independently selected %s consumer', change => {
    const value = executionFixture(change)
    const result = value.execute((_command, args, cwd) => { writeRunnerReport(cwd, args); return 0 })

    expect(result.status).toBe('passed')
    expect(result.checks.map(entry => entry.check)).toEqual([{
      kind: 'vitest', project: 'fast-scripts', files: ['scripts/__tests__/script-consumer.test.ts'],
    }])
    expect(result.preparation.map(command => command.args)).toEqual([
      ['scripts/local-services.mjs', '--test'], ['run', 'build:cards-manifest'],
    ])
  })

  it.each(['documentation', 'script-pure'] as const)('keeps %s verification free of unused services', change => {
    const value = executionFixture(change)
    const result = value.execute((_command, args, cwd) => { writeRunnerReport(cwd, args); return 0 })

    expect(result.status).toBe('passed')
    expect(result.preparation.map(command => command.args)).toEqual([['run', 'build:cards-manifest']])
    expect(result.checks.map(entry => entry.check)).toEqual([{
      kind: 'vitest', project: 'fast-scripts', files: [change === 'documentation' ? 'scripts/__tests__/docs-budget.test.ts' : 'scripts/__tests__/script-consumer.test.ts'],
    }])
  })

  it('prepares services and the manifest once in each Vitest slot while covering every selected file once', () => {
    const value = executionFixture()
    const run = (_command: string, args: string[], cwd: string) => {
      writeRunnerReport(cwd, args)
      return 0
    }
    const results = (['units-1', 'units-2', 'units-3'] as const).map(partition => value.execute(run, partition))
    expect(results.map(result => result.status)).toEqual(['passed', 'passed', 'passed'])
    expect(results.map(result => result.preparation.map(command => command.args))).toEqual([
      [['scripts/local-services.mjs', '--test'], ['run', 'build:cards-manifest']],
      [['scripts/local-services.mjs', '--test'], ['run', 'build:cards-manifest']],
      [['run', 'build:cards-manifest']],
    ])
    expect(results.map(result => result.checks.map(entry => entry.check))).toEqual([
      [{ kind: 'vitest', project: 'slow', files: ['server/__tests__/A029_AleBenches-session.test.ts'] }],
      [{ kind: 'vitest', project: 'fast-server', files: ['server/__tests__/cross-card-session.test.ts'] }],
      [{ kind: 'vitest', project: 'fast-cards', files: ['shared/cards/__tests__/A29_AleBenches.test.ts'] }],
    ])
    const commands = results.flatMap(result => result.checks.flatMap(check => check.commands))
    expect(new Set(commands.map(command => command.args.find(arg => arg.startsWith('--outputFile.json=')))).size).toBe(3)
    for (const command of commands) {
      expect(command.args).toContain('--reporter=default')
      expect(command.args).toContain('--reporter=json')
      expect(command.args.filter(arg => arg === '--project')).toHaveLength(1)
    }
    for (const command of results.flatMap(result => [...result.preparation, ...result.checks.flatMap(check => check.commands)])) {
      expect(command).toMatchObject({ exitCode: 0, startedAt: expect.any(String), completedAt: expect.any(String), durationMs: expect.any(Number) })
      expect(Date.parse(command.completedAt)).toBeGreaterThanOrEqual(Date.parse(command.startedAt))
      expect(command.durationMs).toBeGreaterThanOrEqual(0)
    }
  })

  it.each(['nonzero exit', 'runner exception'])('retains preparation timing after %s', scenario => {
    const value = executionFixture()
    expect(() => value.execute(() => {
      if (scenario === 'runner exception') throw new Error('spawn failed')
      return 7
    })).toThrow()
    expect(JSON.parse(readFileSync(value.output, 'utf8'))).toMatchObject({
      status: 'failed', checks: [], preparation: [{
        exitCode: scenario === 'runner exception' ? null : 7,
        startedAt: expect.any(String), completedAt: expect.any(String), durationMs: expect.any(Number),
        ...(scenario === 'runner exception' ? { error: 'spawn failed' } : {}),
      }],
    })
  })

  it.each(['missing report', 'missing selected file', 'extra substring match', 'duplicate module', 'failed command'])(
    'rejects %s before publishing successful completion', scenario => {
      const value = executionFixture()
      expect(() => value.execute((_command, args, cwd) => {
        if (!args.includes('vitest')) return 0
        if (scenario === 'missing report') return 0
        const files = args.filter(arg => /\.test\.[cm]?[jt]sx?$/.test(arg))
        if (scenario === 'missing selected file') writeRunnerReport(cwd, args, [])
        else if (scenario === 'extra substring match') writeRunnerReport(cwd, args, [...files, `copy/${files[0]}`])
        else if (scenario === 'duplicate module') writeRunnerReport(cwd, args, [...files, ...files])
        else writeRunnerReport(cwd, args)
        return scenario === 'failed command' ? 7 : 0
      })).toThrow()
      const record: unknown = JSON.parse(readFileSync(value.output, 'utf8'))
      expect(record).toMatchObject({ status: 'failed', checks: [{ status: 'failed' }] })
    },
  )

  it('does not reuse a previous successful report when the next execution produces none', () => {
    const value = executionFixture()
    expect(value.execute((_command, args, cwd) => { writeRunnerReport(cwd, args); return 0 }).status).toBe('passed')
    expect(() => value.execute(() => 0)).toThrow()
    expect(JSON.parse(readFileSync(value.output, 'utf8'))).toMatchObject({ status: 'failed', checks: [{ status: 'failed' }] })
  })

  it('prepares browser artifacts once and starts the app and services once for every spec in the slot', () => {
    const value = browserFixture()
    const result = value.execute((_command, args, cwd) => {
      const index = args.indexOf('--report')
      if (index >= 0) writeFileSync(join(cwd, args[index + 1] ?? ''), '{"suites":[]}\n')
      return 0
    }, 'browser-1')
    const commands = [...result.preparation, ...result.checks.flatMap(check => check.commands)].map(command => command.args)
    expect(commands.filter(args => args.join(' ') === 'scripts/local-services.mjs --test')).toHaveLength(1)
    expect(commands.filter(args => args.join(' ') === 'run build:cards-manifest')).toHaveLength(1)
    expect(commands.filter(args => args[0] === 'exec' && args[2] === 'scripts/ci/isolated-browser.ts' && args[3] === 'start')).toHaveLength(1)
    expect(commands.filter(args => args[0] === 'exec' && args[2] === 'scripts/ci/isolated-browser.ts' && args[3] === 'test')).toEqual([
      ['exec', 'tsx', 'scripts/ci/isolated-browser.ts', 'test', 'output/verification/browser-session',
        '--report', 'output/verification/browser-session/1.json', '--retries', '1', '--browser', 'chromium', '--',
        'e2e-tests/pack-a.spec.ts', 'e2e-tests/pack-e.spec.ts'],
    ])
    expect(commands.filter(args => args[3] === 'stop')).toHaveLength(1)
    expect(result.status).toBe('passed')
  })

  it('builds the hosted frontend without a typecheck only when a selected spec depends on it', () => {
    const value = browserFixture()
    const accept = (_command: string, args: string[], cwd: string) => {
      const index = args.indexOf('--report')
      if (index >= 0) writeFileSync(join(cwd, args[index + 1] ?? ''), '{"suites":[]}\n')
      return 0
    }
    const hosted = value.execute(accept, 'browser-1')
    const plain = value.execute(accept, 'browser-2')
    const hostedBuild = ['run', 'build:hosted-frontend', '--', '--no-typecheck']
    expect(hosted.preparation.map(command => command.args).filter(args => args.includes('build:hosted-frontend'))).toEqual([hostedBuild])
    expect(hosted.preparation.some(command => command.args.includes('tsc') || command.args.join(' ') === 'run build')).toBe(false)
    expect(plain.preparation.map(command => command.args).some(args => args.includes('build:hosted-frontend'))).toBe(false)
    expect(plain.checks.flatMap(check => check.commands).map(command => command.args)).toEqual([
      ['exec', 'tsx', 'scripts/ci/isolated-browser.ts', 'test', 'output/verification/browser-session',
        '--report', 'output/verification/browser-session/1.json', '--retries', '1', '--browser', 'chromium', '--',
        'e2e-tests/pack-b.spec.ts'],
    ])
  })

  it('names only a browser case that passed on retry and still passes the partition', () => {
    const value = browserFixture()
    const result = value.execute((_command, args) => {
      const index = args.indexOf('--report')
      const report = index < 0 ? undefined : args[index + 1]
      if (!report) return 0
      writeFileSync(join(value.cwd, report), JSON.stringify({ suites: [{ specs: [
        { title: 'opens the login form', file: 'e2e-tests/pack-b.spec.ts', tests: [{ status: 'expected', results: [{ status: 'passed', retry: 0 }] }] },
        { title: 'keeps the room after the socket drops', file: 'e2e-tests/pack-b.spec.ts', tests: [{ status: 'flaky', results: [{ status: 'failed', retry: 0 }, { status: 'passed', retry: 1 }] }] },
      ] }] }))
      return 0
    }, 'browser-2')
    expect(result.status).toBe('passed')
    const summary = readFileSync(value.summary, 'utf8')
    expect(summary).toContain('e2e-tests/pack-b.spec.ts › keeps the room after the socket drops')
    expect(summary).not.toContain('opens the login form')
  })

  it('fails the browser partition when the retry also fails and does not record that case as passed', () => {
    const value = browserFixture()
    expect(() => value.execute((_command, args) => {
      const index = args.indexOf('--report')
      const report = index < 0 ? undefined : args[index + 1]
      if (!report) return 0
      writeFileSync(join(value.cwd, report), JSON.stringify({ suites: [{ specs: [
        { title: 'keeps the room after the socket drops', file: 'e2e-tests/pack-b.spec.ts', tests: [{ status: 'unexpected', results: [{ status: 'failed', retry: 0 }, { status: 'failed', retry: 1 }] }] },
      ] }] }))
      return 1
    }, 'browser-2')).toThrow()
    expect(readFileSync(value.summary, 'utf8')).not.toContain('keeps the room after the socket drops')
    expect(JSON.parse(readFileSync(value.output, 'utf8'))).toMatchObject({ status: 'failed' })
  })

  it('does not retry release-candidate browser tasks', () => {
    const root = join(import.meta.dirname, '../..')
    for (const id of ['chromium-1', 'chromium-2', 'chromium-3', 'chromium-4', 'browser-sandbox', 'webkit']) {
      expect(taskCommands(root, id).flatMap(command => command.args)).not.toContain('--retries')
    }
  })
})
