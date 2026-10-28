import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
afterEach(() => {
  vi.unstubAllEnvs()
  directories.splice(0).forEach(cwd => rmSync(cwd, { recursive: true, force: true }))
})

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
      `${process.execPath} scripts/local-services.mjs --test`, 'pnpm run check:card-impl-boundaries', 'pnpm run check:verification-types', 'pnpm test:fast', 'pnpm run lint',
    ])
    expect(verificationStatus(cwd).find(entry => entry.mode === 'prepush')).toMatchObject({
      current: true, record: { status: 'passed', steps: [
        { name: 'test-services', status: 'passed' }, { name: 'card-impl-boundaries', status: 'passed' }, { name: 'verification-types', status: 'passed' }, { name: 'fast', status: 'passed' }, { name: 'lint', status: 'passed' },
      ] },
    })
    runVerification(cwd, plan, run)
    expect(calls).toHaveLength(10)
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
      { name: 'test-services', exitCode: 0 }, { name: 'card-impl-boundaries', exitCode: 0 }, { name: 'verification-types', exitCode: 0 }, { name: 'fast', exitCode: 7 },
    ] })
  })

  it('records production scan failure and does not start fast tests or lint', () => {
    const cwd = repo(), plan = verificationPlan(cwd, ['prepush'])
    runVerification(cwd, plan, () => 0)
    const calls: string[] = []
    expect(() => runVerification(cwd, plan, (_command, args) => {
      calls.push(args.join(' '))
      return args.includes('check:card-impl-boundaries') ? 1 : 0
    })).toThrow('card-impl-boundaries failed (exit 1)')
    expect(calls).toEqual(['scripts/local-services.mjs --test', 'run check:card-impl-boundaries'])
    expect(verificationStatus(cwd).find(entry => entry.mode === 'prepush')).toMatchObject({
      current: true, record: { status: 'failed', steps: [
        { name: 'test-services', exitCode: 0 }, { name: 'card-impl-boundaries', exitCode: 1 },
      ] },
    })
  })

  it('stops before fast and lint when verification tool type checking fails', () => {
    const cwd = repo(), calls: string[] = []
    expect(() => runVerification(cwd, verificationPlan(cwd, ['prepush']), (_command, args) => {
      calls.push(args.join(' '))
      return args.includes('check:verification-types') ? 2 : 0
    })).toThrow('verification-types failed (exit 2)')
    expect(calls).toEqual(['scripts/local-services.mjs --test', 'run check:card-impl-boundaries', 'run check:verification-types'])
    expect(verificationStatus(cwd).find(entry => entry.mode === 'prepush')).toMatchObject({
      current: true, record: { status: 'failed', steps: [
        { name: 'test-services', exitCode: 0 }, { name: 'card-impl-boundaries', exitCode: 0 }, { name: 'verification-types', exitCode: 2 },
      ] },
    })
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

  it('excludes only explicit report filenames while the default still hashes them', () => {
    const cwd = repo(), original = sourceFingerprint(cwd)
    mkdirSync(join(cwd, 'reports'))
    const options = { excludeFiles: ['reports/audit.json', 'reports/audit.md'] }
    writeFileSync(join(cwd, 'reports/audit.json'), 'running')
    expect(sourceFingerprint(cwd, options)).toBe(original)
    expect(sourceFingerprint(cwd)).not.toBe(original)
    writeFileSync(join(cwd, 'reports/audit.json'), 'passed')
    writeFileSync(join(cwd, 'reports/audit.md'), 'Finished')
    expect(sourceFingerprint(cwd, options)).toBe(original)
    writeFileSync(join(cwd, 'reports/audit.json.ts'), 'export const source = 2')
    expect(sourceFingerprint(cwd, options)).not.toBe(original)
    writeFileSync(join(cwd, 'source.ts'), 'changed')
    expect(sourceFingerprint(cwd, options)).not.toBe(original)
  })

  it('builds the hosted frontend before the isolated Playwright command and preserves its arguments', () => {
    const cwd = repo(), calls: string[][] = []
    for (const args of [[], ['--', 'e2e-tests/example.spec.ts', '--browser=webkit']]) {
      for (const step of verificationPlan(cwd, args).steps) calls.push([step.command, ...step.args])
    }
    expect(calls).toEqual([
      ['pnpm', 'run', 'build:hosted-frontend'],
      ['bash', 'scripts/verify.sh'],
      ['pnpm', 'run', 'build:hosted-frontend'],
      ['bash', 'scripts/verify.sh', 'e2e-tests/example.spec.ts', '--browser=webkit'],
    ])
    expect(verificationPlan(cwd, ['e2e-tests/example.spec.ts', '--requirements', 'output/required.json']).steps[1]?.args)
      .toEqual(['scripts/verify.sh', 'e2e-tests/example.spec.ts'])
  })

  it.each(['PUBLIC_ASSET_LOCAL_DIR', 'PUBLIC_ASSET_VALIDATION_DIR', 'RELEASE_SMOKE_PROXY'])('invalidates evidence when %s changes', key => {
    const cwd = repo()
    vi.stubEnv(key, undefined)
    runVerification(cwd, verificationPlan(cwd, ['prepush']), () => 0)
    vi.stubEnv(key, '/local/assets')
    expect(verificationStatus(cwd).find(entry => entry.mode === 'prepush')!.current).toBe(false)
  })
})
