import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runVerification, sourceFingerprint, verificationPlan, verificationStatus } from '../verify'

const directories: string[] = []
const repo = () => {
  const cwd = mkdtempSync(join(tmpdir(), 'verification-'))
  directories.push(cwd)
  const git = (...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' })
  git('init', '-q', '--template=', '-b', 'main')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Verification Test')
  writeFileSync(join(cwd, 'source.ts'), 'export const value = 1\n')
  writeFileSync(join(cwd, 'source.test.ts'), '// selected test\n')
  writeFileSync(join(cwd, '.gitignore'), '*.log\n')
  git('add', '.')
  git('-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture')
  return cwd
}
afterEach(() => directories.splice(0).forEach(cwd => rmSync(cwd, { recursive: true, force: true })))

describe('verification modes and evidence', () => {
  it('runs only selected Vitest files in focus mode, without restarting services', () => {
    const cwd = repo(), calls: string[][] = []
    const plan = verificationPlan(cwd, ['focus', 'source.test.ts', '--testNamePattern', 'first turn'])
    runVerification(cwd, plan, (command, args) => { calls.push([command, ...args]); return 0 })
    expect(calls).toEqual([
      ['pnpm', 'run', 'build:cards-manifest'],
      ['pnpm', 'exec', 'vitest', 'run', 'source.test.ts', '--testNamePattern', 'first turn'],
    ])
    expect(verificationStatus(cwd).find(entry => entry.mode === 'focus')).toMatchObject({ current: true, record: { status: 'passed' } })
    expect(verificationStatus(cwd).find(entry => entry.mode === 'prepush')!.record).toBeNull()
    expect(() => verificationPlan(cwd, ['focus'])).toThrow('existing Vitest test file')
    expect(() => verificationPlan(cwd, ['focus', 'missing.test.ts'])).toThrow('existing Vitest test file')
  })

  it('always runs the entire prepush gate and records all completed steps', () => {
    const cwd = repo(), calls: string[] = []
    const plan = verificationPlan(cwd, ['prepush'])
    const run = (command: string, args: string[]) => { calls.push([command, ...args].join(' ')); return 0 }
    runVerification(cwd, plan, run)
    expect(calls).toEqual([
      `${process.execPath} scripts/local-services.mjs --test`, 'pnpm test:fast', 'pnpm run lint',
    ])
    expect(verificationStatus(cwd).find(entry => entry.mode === 'prepush')).toMatchObject({
      current: true, record: { status: 'passed', steps: [
        { name: 'test-services', status: 'passed' }, { name: 'fast', status: 'passed' }, { name: 'lint', status: 'passed' },
      ] },
    })
    runVerification(cwd, plan, run)
    expect(calls).toHaveLength(6)
    expect(() => verificationPlan(cwd, ['prepush', '--project', 'fast-server'])).toThrow('accepts no filters')
  })

  it('stops on failure and replaces previous successful evidence', () => {
    const cwd = repo(), plan = verificationPlan(cwd, ['prepush'])
    runVerification(cwd, plan, () => 0)
    const calls: string[] = []
    expect(() => runVerification(cwd, plan, (_command, args) => {
      calls.push(args.join(' '))
      return args[0] === 'test:fast' ? 7 : 0
    })).toThrow('fast failed (exit 7)')
    expect(calls).not.toContain('run lint')
    const result = verificationStatus(cwd).find(entry => entry.mode === 'prepush')!
    expect(result.current).toBe(true)
    expect(result.record).toMatchObject({ status: 'failed', steps: [
      { name: 'test-services', exitCode: 0 }, { name: 'fast', exitCode: 7 },
    ] })
  })

  it('invalidates a run when a checked source changes during execution', () => {
    const cwd = repo()
    expect(() => runVerification(cwd, verificationPlan(cwd, ['prepush']), () => {
      writeFileSync(join(cwd, 'source.ts'), 'export const value = 2\n')
      return 0
    })).toThrow('Sources changed during verification')
    const record = JSON.parse(readFileSync(join(cwd, 'output/verification/prepush.json'), 'utf8'))
    expect(record.status).toBe('stale')
    expect(record.steps).toHaveLength(1)
  })

  it('tracks unstaged, untracked and deleted source files, but excludes logs and records', () => {
    const cwd = repo(), original = sourceFingerprint(cwd)
    runVerification(cwd, verificationPlan(cwd, ['prepush']), () => 0)
    writeFileSync(join(cwd, 'debug.log'), 'ignored output')
    expect(sourceFingerprint(cwd)).toBe(original)
    writeFileSync(join(cwd, 'source.ts'), 'changed')
    expect(sourceFingerprint(cwd)).not.toBe(original)
    expect(verificationStatus(cwd).find(entry => entry.mode === 'prepush')!.current).toBe(false)
    writeFileSync(join(cwd, 'source.ts'), 'export const value = 1\n')
    writeFileSync(join(cwd, 'new.ts'), 'untracked')
    expect(sourceFingerprint(cwd)).not.toBe(original)
    rmSync(join(cwd, 'new.ts'))
    rmSync(join(cwd, 'source.ts'))
    expect(sourceFingerprint(cwd)).not.toBe(original)
  })

  it('preserves the existing isolated Playwright command and its arguments', () => {
    const cwd = repo(), calls: string[][] = []
    for (const args of [[], ['--', 'e2e-tests/example.spec.ts', '--browser=webkit']]) {
      runVerification(cwd, verificationPlan(cwd, args), (command, params) => {
        calls.push([command, ...params]); return 0
      })
    }
    expect(calls).toEqual([
      ['bash', 'scripts/verify.sh'],
      ['bash', 'scripts/verify.sh', 'e2e-tests/example.spec.ts', '--browser=webkit'],
    ])
  })
})
