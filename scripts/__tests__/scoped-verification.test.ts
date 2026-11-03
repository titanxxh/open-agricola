import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { executeRepositoryPlan, routinePlanManifest } from '../ci/scoped-verification'
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
  return { cwd, output, execute: (run: (command: string, args: string[], cwd: string) => number) =>
    executeRepositoryPlan({ cwd, base: 'main', head: 'HEAD', partition: 'units', output }, run) }
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

  it('prepares services and the manifest once while retaining every complete project check and measured command', () => {
    const value = executionFixture()
    const result = value.execute((_command, args, cwd) => {
      writeRunnerReport(cwd, args)
      return 0
    })
    expect(result.status).toBe('passed')
    expect(result.preparation.map(command => command.args)).toEqual([
      ['scripts/local-services.mjs', '--test'], ['run', 'build:cards-manifest'],
    ])
    expect(result.checks.map(entry => entry.check)).toEqual([
      { kind: 'vitest', project: 'fast-cards', files: ['shared/cards/__tests__/A29_AleBenches.test.ts'] },
      { kind: 'vitest', project: 'fast-server', files: ['server/__tests__/cross-card-session.test.ts'] },
      { kind: 'vitest', project: 'slow', files: ['server/__tests__/A029_AleBenches-session.test.ts'] },
    ])
    const commands = result.checks.flatMap(check => check.commands)
    expect(new Set(commands.map(command => command.args.find(arg => arg.startsWith('--outputFile.json=')))).size).toBe(3)
    for (const command of commands) {
      expect(command.args).toContain('--reporter=default')
      expect(command.args).toContain('--reporter=json')
      expect(command.args.filter(arg => arg === '--project')).toHaveLength(1)
    }
    for (const command of [...result.preparation, ...result.checks.flatMap(check => check.commands)]) {
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
})
