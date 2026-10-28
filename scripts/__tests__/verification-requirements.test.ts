import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { runVerification, verificationPlan, verificationRequirementsStatus, verificationStatus } from '../verify'
import { loadRequirements, parseRequirements, type CaseIdentity } from '../verification-requirements'

const directories: string[] = []
const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
const cli = join(projectRoot, 'node_modules/playwright/cli.js')
const required = (title: string): CaseIdentity => ({ file: 'control.spec.ts', titlePath: ['control', title], project: 'chromium', browser: 'chromium' })

function fixture(titles: string[]) {
  const cwd = mkdtempSync(join(tmpdir(), 'verification-browser-'))
  directories.push(cwd)
  mkdirSync(join(cwd, 'output'))
  writeFileSync(join(cwd, '.gitignore'), 'output/\nnode_modules/\n')
  symlinkSync(join(projectRoot, 'node_modules'), join(cwd, 'node_modules'), 'dir')
  writeFileSync(join(cwd, 'playwright.config.ts'), `import { defineConfig } from '@playwright/test'
export default defineConfig({ testDir: '.', outputDir: './output/playwright', workers: 1, reporter: [['dot'], ['./user-reporter.cjs']], use: { browserName: 'chromium' } })
`)
  writeFileSync(join(cwd, 'user-reporter.cjs'), `const fs = require('node:fs'); module.exports = class {
onEnd() { fs.appendFileSync(${JSON.stringify(join(cwd, 'output/user-reporter.txt'))}, 'called\\n') }
printsToStdio() { return false }
}`)
  writeFileSync(join(cwd, 'control.spec.ts'), `import { test, expect } from '@playwright/test'
test.describe('control', () => {
  test('first', ({}, info) => {
    test.skip(process.env.CONTROL_SKIP_FIRST === '1')
    if (process.env.CONTROL_EXPECT_FAILURE === '1') test.fail()
    expect(process.env.CONTROL_FAIL_FIRST).not.toBe('1')
    if (process.env.CONTROL_FLAKY_FIRST === '1') expect(info.retry).toBe(1)
  })
  test('second', () => { expect(2 + 2).toBe(4) })
  test.skip('skipped', () => {})
  test('expected failure', () => { test.fail(); expect(1).toBe(2) })
  test('flaky', ({}, info) => { expect(info.retry).toBe(1) })
})
`)
  writeFileSync(join(cwd, 'selection-only-reporter.ts'), `import Reporter from ${JSON.stringify(join(projectRoot, 'scripts/verification-reporter.ts'))}
export default class SelectionOnlyReporter extends Reporter { onEnd() {} }
`)
  const requirementsPath = 'output/required.json'
  const requirements = (next: string[]) => writeFileSync(join(cwd, requirementsPath), JSON.stringify({ schemaVersion: 1, cases: next.map(required) }))
  requirements(titles)
  const git = (...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' })
  git('init', '-q', '--template=', '-b', 'main')
  git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Verification Test')
  git('add', '.'); git('-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture')
  const prepush = () => runVerification(cwd, verificationPlan(cwd, ['prepush']), () => 0)
  prepush()
  let output = ''
  const run = (grep: string, env: NodeJS.ProcessEnv = {}, extra: string[] = [], requirements: string | null = requirementsPath) => {
    const plan: Parameters<typeof runVerification>[1] = {
      mode: 'e2e', requirementsPath: requirements,
      // Exercise the real Playwright/reporter child without starting an application.
      steps: [{ name: 'browser-tests', command: process.execPath, args: [cli, 'test', '--config', join(cwd, 'playwright.config.ts'), '--browser=chromium', '--grep', grep, ...extra] }],
    }
    return runVerification(cwd, plan, (command, args, directory, environment) => {
      const child = spawnSync(command, args, { cwd: directory, env: { ...environment, ...env }, encoding: 'utf8' })
      output = String(child.stdout) + String(child.stderr)
      if (child.error) throw child.error
      return child.status ?? 1
    })
  }
  return { cwd, run, prepush, requirements, status: () => verificationRequirementsStatus(cwd, requirementsPath), output: () => output }
}

afterEach(() => { directories.splice(0).forEach(cwd => rmSync(cwd, { recursive: true, force: true })) })

describe('explicit browser requirements and real reporter evidence', () => {
  it('rejects missing identities and file-only declarations', () => {
    expect(() => parseRequirements({ schemaVersion: 1, cases: [{ file: 'control.spec.ts' }] })).toThrow('titlePath')
    expect(() => parseRequirements({ schemaVersion: 1, cases: [{ ...required('first'), file: '../control.spec.ts' }] })).toThrow('repository-relative')
    expect(() => parseRequirements({ schemaVersion: 1, cases: [required('first'), required('first')] })).toThrow('Duplicate')
    const control = fixture(['first'])
    expect(control.status()).toMatchObject({ prepush: true, passed: false, cases: [{ status: 'missing' }] })
    expect(verificationStatus(control.cwd).find(entry => entry.mode === 'prepush')).toMatchObject({ current: true, record: { status: 'passed' } })
  })

  it('does not claim a grep-excluded case passed and preserves configured reporters', () => {
    const control = fixture(['first'])
    control.run('second')
    expect(control.output()).toContain('1 passed')
    expect(readFileSync(join(control.cwd, 'output/user-reporter.txt'), 'utf8')).toBe('called\n')
    expect(control.status()).toMatchObject({ passed: false, cases: [{ status: 'missing' }] })
    const runDirectory = join(control.cwd, 'output/verification/e2e-runs/000000000001')
    const result: unknown = JSON.parse(readFileSync(join(runDirectory, 'results.json'), 'utf8'))
    expect(result).toMatchObject({ cases: [{ identity: required('second'), status: 'passed' }] })
  })

  it('accumulates successful runs, then replaces an older pass with a real failure', () => {
    const control = fixture(['first', 'second'])
    control.run('first')
    const before = readFileSync(join(control.cwd, 'output/verification/e2e-runs/000000000001/results.json'), 'utf8')
    expect(control.status().passed).toBe(false)
    control.run('second')
    expect(control.status().passed).toBe(true)
    expect(() => control.run('first', { CONTROL_FAIL_FIRST: '1' })).toThrow('browser-tests failed')
    expect(control.status()).toMatchObject({ passed: false, cases: [{ status: 'failed' }, { status: 'passed' }] })
    control.run('first')
    expect(control.status().passed).toBe(true)
    expect(readdirSync(join(control.cwd, 'output/verification/e2e-runs'))).toHaveLength(4)
    expect(readFileSync(join(control.cwd, 'output/verification/e2e-runs/000000000001/results.json'), 'utf8')).toBe(before)
  })

  it('fails closed instead of reusing a pass when the additional reporter produces no evidence', () => {
    const control = fixture(['first'])
    control.run('first')
    expect(control.status().passed).toBe(true)
    expect(() => control.run('first', { PW_TEST_REPORTER: '' })).toThrow('results.json')
    expect(control.status()).toMatchObject({ passed: false, cases: [{ status: 'incomplete' }] })
  })

  it('revokes a bound pass after the same case fails without requirements, and only the bound plan can restore it', () => {
    const control = fixture(['first'])
    control.run('first'); expect(control.status().passed).toBe(true)
    expect(() => control.run('first', { CONTROL_FAIL_FIRST: '1' }, [], null)).toThrow('browser-tests failed')
    expect(control.status()).toMatchObject({ passed: false, cases: [{ status: 'failed' }] })
    control.run('first', {}, [], null)
    expect(control.status().passed).toBe(false)
    control.run('first'); expect(control.status().passed).toBe(true)
  })

  it('revokes a bound pass after a failure under a different requirements hash', () => {
    const control = fixture(['first']), alternate = 'output/other-required.json'
    writeFileSync(join(control.cwd, alternate), JSON.stringify({ schemaVersion: 1, cases: [required('first'), required('second')] }))
    control.run('first'); expect(control.status().passed).toBe(true)
    expect(() => control.run('first', { CONTROL_FAIL_FIRST: '1' }, [], alternate)).toThrow('browser-tests failed')
    expect(control.status().passed).toBe(false)
    control.run('first', {}, [], alternate)
    expect(control.status().passed).toBe(false)
    control.run('first'); expect(control.status().passed).toBe(true)
  })

  it.each([
    { label: 'skip', env: { CONTROL_SKIP_FIRST: '1' }, args: [] },
    { label: 'expected failure', env: { CONTROL_EXPECT_FAILURE: '1', CONTROL_FAIL_FIRST: '1' }, args: [] },
    { label: 'flaky', env: { CONTROL_FLAKY_FIRST: '1' }, args: ['--retries=1'] },
  ])('revokes an earlier bound pass after an ordinary $label result', ({ env, args }) => {
    const control = fixture(['first'])
    control.run('first'); expect(control.status().passed).toBe(true)
    control.run('first', env, args, null)
    expect(control.status().passed).toBe(false)
  })

  it('uses actual filtered discovery to revoke an incomplete ordinary run without revoking unrelated cases', () => {
    const control = fixture(['first'])
    control.run('first'); expect(control.status().passed).toBe(true)
    control.run('expected failure', {}, [], null)
    expect(control.status().passed).toBe(true)
    const selectionOnly = { PW_TEST_REPORTER: join(control.cwd, 'selection-only-reporter.ts') }
    expect(() => control.run('second', selectionOnly, [], null)).toThrow('results.json')
    expect(control.status().passed).toBe(true)
    expect(() => control.run('first', selectionOnly, [], null)).toThrow('results.json')
    expect(control.status()).toMatchObject({ passed: false, cases: [{ status: 'incomplete' }] })
    control.run('first'); expect(control.status().passed).toBe(true)
  })

  it.each(['skipped', 'expected failure', 'flaky'])('requires an actual clean pass, not %s', title => {
    const control = fixture([title])
    control.run(title, {}, title === 'flaky' ? ['--retries=1'] : [])
    expect(control.status().passed).toBe(false)
    expect(control.status().cases[0]?.status).toBe(title === 'skipped' ? 'skipped' : 'failed')
  })

  it('invalidates source changes and ignored requirements content changes', () => {
    const control = fixture(['first'])
    control.run('first'); expect(control.status().passed).toBe(true)
    const original = loadRequirements(control.cwd, 'output/required.json').binding.sha256
    control.requirements(['first', 'second'])
    expect(loadRequirements(control.cwd, 'output/required.json').binding.sha256).not.toBe(original)
    expect(control.status()).toMatchObject({ prepush: true, passed: false, cases: [{ status: 'missing' }, { status: 'missing' }] })
    control.run('first|second'); expect(control.status().passed).toBe(true)
    writeFileSync(join(control.cwd, 'control.spec.ts'), readFileSync(join(control.cwd, 'control.spec.ts'), 'utf8') + '\n// source changed\n')
    expect(control.status()).toMatchObject({ prepush: false, passed: false })
    control.prepush()
    expect(control.status()).toMatchObject({ prepush: true, passed: false, cases: [{ status: 'missing' }, { status: 'missing' }] })
  })

  it('does not count matching titles from a different browser/project', () => {
    const control = fixture(['first'])
    const path = join(control.cwd, 'output/required.json')
    writeFileSync(path, JSON.stringify({ schemaVersion: 1, cases: [{ ...required('first'), project: 'webkit', browser: 'webkit' }] }))
    control.run('first')
    expect(control.status()).toMatchObject({ passed: false, cases: [{ status: 'missing' }] })
  })
})
