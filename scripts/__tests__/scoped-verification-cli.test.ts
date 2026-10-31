import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const cli = join(root, 'scripts/ci/scoped-verification.ts')
const temporary: string[] = []
afterEach(() => temporary.splice(0).forEach(cwd => rmSync(cwd, { recursive: true, force: true })))
const write = (cwd: string, file: string, content: string) => {
  mkdirSync(dirname(join(cwd, file)), { recursive: true })
  writeFileSync(join(cwd, file), content)
}
const githubJobOutputs = (file: string): Record<string, string> => Object.fromEntries(
  readFileSync(file, 'utf8').trim().split('\n').map(line => {
    const separator = line.indexOf('=')
    return [line.slice(0, separator), line.slice(separator + 1)]
  }).filter(([, value]) => value !== ''),
)

const skippedBrowserJobs = () => ({
  'browser-1': { result: 'skipped', outputs: {} }, 'browser-2': { result: 'skipped', outputs: {} },
  'browser-3': { result: 'skipped', outputs: {} }, 'browser-4': { result: 'skipped', outputs: {} },
})

function fixture(change: 'documentation' | 'frontend' | 'card' = 'documentation') {
  const cwd = mkdtempSync(join(tmpdir(), 'scoped-verification-cli-'))
  temporary.push(cwd)
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const commit = (title: string) => {
    git('add', '--', '.', ':(exclude)docs/superpowers/**')
    git('-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-qm', title)
    return git('rev-parse', 'HEAD')
  }
  for (const directory of ['shared', 'server', 'client', 'scripts', 'tests', 'e2e-tests', 'replay-viewer']) write(cwd, `${directory}/.keep`, '')
  write(cwd, 'scripts/__tests__/docs-budget.test.ts', '// documentation constraint\n')
  write(cwd, 'scripts/local-services.mjs', '// External dependencies are supplied by this CLI fixture.\n')
  write(cwd, 'client/components/board/FarmBoard.tsx', 'export const board = 1\n')
  write(cwd, 'client/components/board/__tests__/FarmBoard.test.tsx', '// client group\n')
  for (const name of ['farm-select', 'choice-previews', 'farm-card-targets', 'desktop-table-layout', 'mobile-game-layout', 'frontend-browser-scenario-matrix']) {
    write(cwd, `e2e-tests/${name}.spec.ts`, '// browser consumer\n')
  }
  write(cwd, 'README.md', 'Guide\n')
  if (change === 'card') {
    write(cwd, 'e2e-tests/card-localization.spec.ts', '// generic card metadata consumer\n')
    write(cwd, 'shared/cards/A/A029_AleBenches.ts', "export const A029_AleBenches = defineMinorCard({ meta: { id: 'A029_AleBenches', cost: { wood: 1 } } })\n")
    write(cwd, 'shared/cards/__tests__/A29_AleBenches.test.ts', "import '../A/A029_AleBenches'\n")
    write(cwd, 'server/__tests__/A029_AleBenches-session.test.ts', "const ALE = 'A029_AleBenches'\n")
    write(cwd, 'server/__tests__/cross-card-session.test.ts', "import { ALE } from './_helpers/audit'\n")
    write(cwd, 'server/__tests__/_helpers/audit.ts', "export const ALE = 'A29_AleBenches'\n")
  }
  write(cwd, 'package.json', JSON.stringify({ scripts: { 'check:architecture': 'pnpm run lint && pnpm run check:architecture-tests && pnpm run check:dependencies' } }))
  write(cwd, '.gitignore', 'output/\nbin/\ncommands.jsonl\n')
  git('init', '-q', '--template=', '-b', 'main')
  git('config', 'user.email', 'scope@example.test')
  git('config', 'user.name', 'Scoped Verification Test')
  commit('baseline')
  git('checkout', '-qb', 'feature')
  if (change === 'documentation') write(cwd, 'README.md', 'Updated guide\n')
  else if (change === 'frontend') write(cwd, 'client/components/board/FarmBoard.tsx', 'export const board = 2\n')
  else write(cwd, 'shared/cards/A/A029_AleBenches.ts', "export const A029_AleBenches = defineMinorCard({ meta: { id: 'A029_AleBenches', cost: { wood: 2 } } })\n")
  const sha = commit(change)
  const bin = join(cwd, 'bin')
  const log = join(cwd, 'commands.jsonl')
  write(cwd, 'bin/pnpm', `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.COMMAND_LOG, JSON.stringify(args.filter(arg => !arg.startsWith('--reporter=') && !arg.startsWith('--outputFile.json='))) + '\\n');
if (process.env.FAIL_COMMAND && args.includes(process.env.FAIL_COMMAND)) process.exit(7);
if (process.env.MUTATE_SOURCE) fs.appendFileSync('README.md', 'changed during execution\\n');
if (args.includes('vitest')) {
  const reports = args.filter(arg => arg.startsWith('--outputFile.json='));
  if (reports.length !== 1 || !args.includes('--reporter=default') || !args.includes('--reporter=json') || args.filter(arg => arg === '--project').length !== 1) process.exit(8);
  if (process.env.REPORT_MODE !== 'missing') {
    const files = args.filter(arg => /\\.test\\.[cm]?[jt]sx?$/.test(arg));
    if (process.env.REPORT_MODE === 'extra') files.push('copy/' + files[0]);
    fs.writeFileSync(reports[0].slice('--outputFile.json='.length), JSON.stringify({
      success: true, numFailedTests: 0, numFailedTestSuites: 0, numPendingTestSuites: 0,
      testResults: files.map(file => ({ name: path.join(process.cwd(), file), status: 'passed', assertionResults: [{ status: 'passed' }] })),
    }));
  }
}
`)
  chmodSync(join(bin, 'pnpm'), 0o755)
  const env: NodeJS.ProcessEnv = { ...process.env, GITHUB_SHA: sha, GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '', COMMAND_LOG: log, PATH: bin + delimiter + process.env.PATH }
  const run = (...args: string[]) => spawnSync(join(root, 'node_modules/.bin/tsx'), [cli, ...args], { cwd, env, encoding: 'utf8', timeout: 15_000 })
  const commands = () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((line): unknown => JSON.parse(line)) : []
  return { cwd, sha, run, env, commit, commands }
}

describe('scoped verification public CLI', () => {
  it('plans and executes the complete associated Unit, cross-card and slow Session files for a card edit', () => {
    const value = fixture('card')
    const planned = value.run('plan', '--base', 'main')
    expect(planned.status, planned.stderr).toBe(0)
    const manifest: unknown = JSON.parse(planned.stdout)
    expect(manifest).toMatchObject({ mode: 'scoped', catalog_tasks: 'quality,build,browser-sandbox,webkit' })
    const result = value.run('run', '--base', 'main', '--partition', 'units')
    expect(result.status, result.stderr).toBe(0)
    expect(value.commands().filter(command => Array.isArray(command) && command.includes('vitest'))).toEqual([
      ['exec', 'vitest', 'run', '--project', 'fast-cards', 'shared/cards/__tests__/A29_AleBenches.test.ts'],
      ['exec', 'vitest', 'run', '--project', 'fast-server', 'server/__tests__/cross-card-session.test.ts'],
      ['exec', 'vitest', 'run', '--project', 'slow', 'server/__tests__/A029_AleBenches-session.test.ts'],
    ])
    expect(value.commands().filter(command => Array.isArray(command) && command.includes('build:cards-manifest'))).toHaveLength(1)
  }, 60_000)

  it('a selected slow Session failure blocks card completion and the public required gate', () => {
    const value = fixture('card')
    value.env.GITHUB_OUTPUT = join(value.cwd, 'output/card-plan.txt')
    expect(value.run('plan', '--base', 'main').status).toBe(0)
    const outputs = Object.fromEntries(readFileSync(value.env.GITHUB_OUTPUT, 'utf8').trim().split('\n').map(line => {
      const at = line.indexOf('=')
      return [line.slice(0, at), line.slice(at + 1)]
    }))
    value.env.GITHUB_OUTPUT = join(value.cwd, 'output/card-execution.txt')
    value.env.FAIL_COMMAND = 'slow'
    const result = value.run('run', '--base', 'main', '--partition', 'units')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Selected vitest check failed')
    expect(value.commands()).toContainEqual(['exec', 'vitest', 'run', '--project', 'slow', 'server/__tests__/A029_AleBenches-session.test.ts'])
    expect(existsSync(value.env.GITHUB_OUTPUT)).toBe(false)
    const summary = value.run('gate', '--sha', value.sha, '--needs', JSON.stringify({
      plan: { result: 'success', outputs }, units: { result: 'failure', outputs: {} }, ...skippedBrowserJobs(), catalog: { result: 'skipped', outputs: {} },
    }))
    expect(summary.status).toBe(1)
    expect(summary.stderr).toContain('Selected units partition did not all succeed')
  }, 60_000)

  it('executes documentation constraints and passes the gate with GitHub job output omission', () => {
    const value = fixture()
    const planOutput = join(value.cwd, 'output/documentation-plan.txt')
    value.env.GITHUB_OUTPUT = planOutput
    const planned = value.run('plan', '--base', 'main')
    expect(planned.status, planned.stderr).toBe(0)
    expect(JSON.parse(planned.stdout)).toMatchObject({ mode: 'scoped', catalog_tasks: 'none' })
    const executionOutput = join(value.cwd, 'output/documentation-execution.txt')
    value.env.GITHUB_OUTPUT = executionOutput
    const result = value.run('run', '--base', 'main', '--plan', 'output/verification/scoped-plan.json', '--partition', 'units')
    expect(result.status, result.stderr).toBe(0)
    expect(value.commands()).toEqual([
      ['run', 'build:cards-manifest'],
      ['exec', 'vitest', 'run', '--project', 'fast-scripts', 'scripts/__tests__/docs-budget.test.ts'],
    ])
    const record: unknown = JSON.parse(readFileSync(join(value.cwd, 'output/verification/scoped-result.json'), 'utf8'))
    expect(record).toMatchObject({ kind: 'routine', status: 'passed', partition: 'units', checks: [{ status: 'passed' }] })
    const plan = githubJobOutputs(planOutput)
    expect(plan).not.toHaveProperty('browsers')
    const needs = {
      plan: { result: 'success', outputs: plan },
      units: { result: 'success', outputs: githubJobOutputs(executionOutput) },
      ...skippedBrowserJobs(), catalog: { result: 'skipped', outputs: {} },
    }
    value.env.NEEDS_JSON = JSON.stringify(needs)
    const accepted = value.run('gate', '--sha', value.sha)
    expect(accepted.status, accepted.stderr).toBe(0)
    expect(JSON.parse(accepted.stdout)).toMatchObject({ status: 'passed', mode: 'scoped', sha: value.sha })

    delete plan.catalog_tasks
    value.env.NEEDS_JSON = JSON.stringify(needs)
    const missing = value.run('gate', '--sha', value.sha)
    expect(missing.status).toBe(1)
    expect(missing.stderr).toContain('Missing verification job output')
  }, 60_000)

  it.each(['missing', 'extra'])('rejects %s module evidence even when the selected command exits successfully', mode => {
    const value = fixture()
    value.env.REPORT_MODE = mode
    value.env.GITHUB_OUTPUT = join(value.cwd, 'output/execution-outputs.txt')
    const result = value.run('run', '--base', 'main', '--partition', 'units')
    expect(result.status).toBe(1)
    expect(existsSync(value.env.GITHUB_OUTPUT)).toBe(false)
    expect(JSON.parse(readFileSync(join(value.cwd, 'output/verification/scoped-result.json'), 'utf8'))).toMatchObject({
      status: 'failed', checks: [{ status: 'failed', commands: [{ exitCode: 0 }] }],
    })
  })

  it('cannot erase required checks from a saved plan while preserving its source fingerprint', () => {
    const value = fixture()
    expect(value.run('plan', '--base', 'main').status).toBe(0)
    const path = 'output/verification/scoped-plan.json'
    const saved: unknown = JSON.parse(readFileSync(join(value.cwd, path), 'utf8'))
    if (typeof saved !== 'object' || saved === null) throw new Error('Missing plan')
    write(value.cwd, path, JSON.stringify({ ...saved, checks: [] }))
    write(value.cwd, 'output/verification/scoped-result.json', JSON.stringify({ status: 'passed' }))

    const result = value.run('run', '--base', 'main', '--plan', path, '--partition', 'units')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('differs from the canonical repository plan')
    expect(value.commands()).toEqual([])
    const record: unknown = JSON.parse(readFileSync(join(value.cwd, 'output/verification/scoped-result.json'), 'utf8'))
    expect(record).toMatchObject({ kind: 'routine', status: 'failed' })
  })

  it('executes selected browser specs and canonical catalog commands with literal argv selectors', () => {
    const value = fixture('frontend')
    const plan = value.run('plan', '--base', 'main')
    expect(plan.status, plan.stderr).toBe(0)
    const manifest: unknown = JSON.parse(plan.stdout)
    expect(manifest).toMatchObject({ mode: 'scoped', catalog_tasks: 'quality,build', browsers: 'chromium webkit' })
    const result = value.run('run', '--base', 'main')
    expect(result.status, result.stderr).toBe(0)
    expect(value.commands()).toEqual([
      ['run', 'build:cards-manifest'],
      ['exec', 'vitest', 'run', '--project', 'fast-client', 'client/components/board/__tests__/FarmBoard.test.tsx'],
      ['run', 'lint'], ['run', 'check:dependencies'], ['run', 'lint:i18n'],
      ['run', 'build'], ['run', 'build:replay-viewer'], ['run', 'check:bundle-size'],
      ['verify', 'e2e-tests/choice-previews.spec.ts', 'e2e-tests/desktop-table-layout.spec.ts', 'e2e-tests/farm-card-targets.spec.ts', 'e2e-tests/farm-select.spec.ts', 'e2e-tests/mobile-game-layout.spec.ts', '--browser=chromium'],
      ['verify', 'e2e-tests/frontend-browser-scenario-matrix.spec.ts', '--browser=chromium', '--grep', '@viewport|@ws'],
      ['verify', 'e2e-tests/frontend-browser-scenario-matrix.spec.ts', '--browser=webkit', '--grep', '@webkit'],
    ])
  }, 60_000)

  it('passes unusual selected file names as one argument without interpreting shell syntax', () => {
    const value = fixture('frontend')
    const test = 'client/components/board/__tests__/FarmBoard.$(touch SHELL_EXECUTED).test.tsx'
    write(value.cwd, test, '// added client test\n')
    value.env.GITHUB_SHA = value.commit('additional frontend test')
    const result = value.run('run', '--base', 'main', '--partition', 'units')
    expect(result.status, result.stderr).toBe(0)
    expect(value.commands()).toContainEqual(['exec', 'vitest', 'run', '--project', 'fast-client', test, 'client/components/board/__tests__/FarmBoard.test.tsx'])
    expect(existsSync(join(value.cwd, 'SHELL_EXECUTED'))).toBe(false)
  })

  it('executes each selected browser partition with its exact files, filters, engine and bound outputs', () => {
    const value = fixture('frontend')
    const planOutput = join(value.cwd, 'output/partition-plan.txt')
    value.env.GITHUB_OUTPUT = planOutput
    expect(value.run('plan', '--base', 'main').status).toBe(0)
    const plan = githubJobOutputs(planOutput)
    const needs: Record<string, { result: string; outputs: Record<string, string> }> = {
      plan: { result: 'success', outputs: plan },
      catalog: { result: 'success', outputs: { verified_tasks: 'quality,build', verified_sha: value.sha } },
    }
    for (const id of ['units', 'browser-1', 'browser-2', 'browser-3', 'browser-4']) {
      const output = join(value.cwd, `output/${id}-outputs.txt`)
      value.env.GITHUB_OUTPUT = output
      const result = value.run('run', '--base', 'main', '--partition', id, '--expected-digest', plan.plan_digest,
        '--output', `output/${id}-result.json`)
      expect(result.status, result.stderr).toBe(0)
      const outputs = githubJobOutputs(output)
      expect(outputs).toMatchObject({ partition_id: id, plan_digest: plan.plan_digest, tested_sha: value.sha, status: 'passed' })
      expect(outputs.partition_digest).toMatch(/^[a-f0-9]{64}$/)
      needs[id] = { result: 'success', outputs }
    }
    expect(value.commands()).toEqual([
      ['run', 'build:cards-manifest'],
      ['exec', 'vitest', 'run', '--project', 'fast-client', 'client/components/board/__tests__/FarmBoard.test.tsx'],
      ['verify', 'e2e-tests/frontend-browser-scenario-matrix.spec.ts', '--browser=chromium', '--grep', '@viewport|@ws'],
      ['verify', 'e2e-tests/farm-select.spec.ts', '--browser=chromium'],
      ['verify', 'e2e-tests/choice-previews.spec.ts', 'e2e-tests/mobile-game-layout.spec.ts', '--browser=chromium'],
      ['verify', 'e2e-tests/desktop-table-layout.spec.ts', '--browser=chromium'],
      ['verify', 'e2e-tests/frontend-browser-scenario-matrix.spec.ts', '--browser=webkit', '--grep', '@webkit'],
      ['verify', 'e2e-tests/farm-card-targets.spec.ts', '--browser=chromium'],
    ])
    value.env.NEEDS_JSON = JSON.stringify(needs)
    expect(value.run('gate', '--sha', value.sha).status).toBe(0)
    needs['browser-3'] = { result: 'failure', outputs: {} }
    value.env.NEEDS_JSON = JSON.stringify(needs)
    const failed = value.run('gate', '--sha', value.sha)
    expect(failed.status).toBe(1)
    expect(failed.stderr).toContain('Selected browser-3 partition')
  }, 120_000)

  it.each(['inline', 'browser-5'])('rejects unknown execution partition %s before running commands', id => {
    const value = fixture()
    const result = value.run('run', '--base', 'main', '--partition', id)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Unknown execution partition')
    expect(value.commands()).toEqual([])
  })

  it('blocks a selected browser failure and never reports completion of later checks', () => {
    const value = fixture('frontend')
    value.env.FAIL_COMMAND = 'verify'
    value.env.GITHUB_OUTPUT = join(value.cwd, 'output/execution-outputs.txt')
    const result = value.run('run', '--base', 'main', '--partition', 'browser-1')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Selected browser check failed')
    expect(value.commands()).toEqual([['verify', 'e2e-tests/frontend-browser-scenario-matrix.spec.ts', '--browser=chromium', '--grep', '@viewport|@ws']])
    expect(existsSync(value.env.GITHUB_OUTPUT)).toBe(false)
    const record: unknown = JSON.parse(readFileSync(join(value.cwd, 'output/verification/scoped-result.json'), 'utf8'))
    expect(record).toMatchObject({ status: 'failed', checks: [{ status: 'failed' }] })
  })

  it('rejects a plan digest from another source and does not execute any command', () => {
    const value = fixture()
    const result = value.run('run', '--base', 'main', '--expected-digest', '9'.repeat(64), '--partition', 'units')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Verification plan digest changed')
    expect(value.commands()).toEqual([])
  })

  it('replaces a previous passed execution when the supplied plan JSON is malformed', () => {
    const value = fixture()
    expect(value.run('run', '--base', 'main', '--partition', 'units').status).toBe(0)
    write(value.cwd, 'output/broken-plan.json', '{')
    const result = value.run('run', '--base', 'main', '--plan', 'output/broken-plan.json')
    expect(result.status).toBe(1)
    const record: unknown = JSON.parse(readFileSync(join(value.cwd, 'output/verification/scoped-result.json'), 'utf8'))
    expect(record).toMatchObject({ kind: 'routine', status: 'failed' })
  })

  it.each([
    { command: 'plan', options: ['--base', 'missing-ref'] },
    { command: 'run', options: ['--unknown-option'] },
  ])('replaces its custom output on a failed $command attempt', ({ command, options }) => {
    const value = fixture()
    const output = 'output/custom-result.json'
    write(value.cwd, output, JSON.stringify({ status: 'passed' }))
    const result = value.run(command, ...options, '--output', output)
    expect(result.status).toBe(1)
    const record: unknown = JSON.parse(readFileSync(join(value.cwd, output), 'utf8'))
    expect(record).toMatchObject({ status: 'failed' })
  })

  it('a failed selected command exits unsuccessfully and the public summary gate blocks it', () => {
    const value = fixture()
    const planOutputs = 'output/plan-outputs.txt'
    value.env.GITHUB_OUTPUT = join(value.cwd, planOutputs)
    expect(value.run('plan', '--base', 'main').status).toBe(0)
    const outputs = Object.fromEntries(readFileSync(join(value.cwd, planOutputs), 'utf8').trim().split('\n').map(line => {
      const at = line.indexOf('=')
      return [line.slice(0, at), line.slice(at + 1)]
    }))
    value.env.GITHUB_OUTPUT = join(value.cwd, 'output/execution-outputs.txt')
    value.env.FAIL_COMMAND = 'vitest'
    const failed = value.run('run', '--base', 'main', '--partition', 'units')
    expect(failed.status).toBe(1)
    expect(failed.stderr).toContain('Selected vitest check failed')
    expect(existsSync(value.env.GITHUB_OUTPUT)).toBe(false)
    const summary = value.run('gate', '--sha', value.sha, '--needs', JSON.stringify({
      plan: { result: 'success', outputs }, units: { result: 'failure', outputs: {} }, ...skippedBrowserJobs(), catalog: { result: 'skipped', outputs: {} },
    }))
    expect(summary.status).toBe(1)
    expect(summary.stderr).toContain('Selected units partition did not all succeed')
    const record: unknown = JSON.parse(readFileSync(join(value.cwd, 'output/verification/scoped-result.json'), 'utf8'))
    expect(record).toMatchObject({ kind: 'routine', status: 'failed', checks: [{ status: 'failed' }] })
  }, 60_000)

  it('rejects source mutation during selected commands and a workflow checkout mismatch', () => {
    const value = fixture()
    value.env.GITHUB_SHA = '9'.repeat(40)
    const mismatch = value.run('run', '--base', 'main', '--partition', 'units')
    expect(mismatch.status).toBe(1)
    expect(mismatch.stderr).toContain('actual checkout does not match')
    expect(value.commands()).toEqual([])
    value.env.GITHUB_SHA = value.sha
    value.env.MUTATE_SOURCE = '1'
    const changed = value.run('run', '--base', 'main', '--partition', 'units')
    expect(changed.status).toBe(1)
    expect(changed.stderr).toContain('Source contents changed')
    expect(value.commands()).toEqual([['run', 'build:cards-manifest']])
  })
})
