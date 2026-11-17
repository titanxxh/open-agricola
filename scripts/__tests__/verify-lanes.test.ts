import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { weightedAssignment } from '../ci/verification-tasks'
import { testPortRange } from '../test-ports'
import { hostedFrontendMismatch, laneArguments, laneCount, splitFileArgs, writeHostedFrontendMarker } from '../verify-lanes'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function checkout(files: string[]) {
  const root = mkdtempSync(join(tmpdir(), 'oa-verify-lanes-')); roots.push(root)
  mkdirSync(join(root, 'e2e-tests'))
  for (const file of files) writeFileSync(join(root, file), '// spec\n')
  return root
}
const head = 'a'.repeat(40)

describe('weighted assignment', () => {
  it('places every file once, heaviest first into the lightest group, ties by path, unknown files at the median', () => {
    const weights = { 'e2e-tests/a.spec.ts': 50, 'e2e-tests/b.spec.ts': 40, 'e2e-tests/c.spec.ts': 30, 'e2e-tests/d.spec.ts': 10 }
    const files = ['e2e-tests/d.spec.ts', 'e2e-tests/c.spec.ts', 'e2e-tests/b.spec.ts', 'e2e-tests/a.spec.ts', 'e2e-tests/new.spec.ts']
    const groups = weightedAssignment(files, 2, weights)
    // a(50)→0, b(40)→1, new(median 40)→1, c(30)→0, d(10)→0
    expect(groups).toEqual([['e2e-tests/a.spec.ts', 'e2e-tests/c.spec.ts', 'e2e-tests/d.spec.ts'], ['e2e-tests/b.spec.ts', 'e2e-tests/new.spec.ts']])
    expect(weightedAssignment([...files].reverse(), 2, weights)).toEqual(groups)
    expect(groups.flat().sort()).toEqual([...files].sort())
    expect(weightedAssignment(files, 8, weights).filter(group => group.length)).toHaveLength(5)
    expect(() => weightedAssignment(files, 0, weights)).toThrow(/at least one group/)
  })
})

describe('lane planning', () => {
  it('takes --shards, then VERIFY_PARALLEL_LANES, then one in-place lane', () => {
    expect(laneCount(undefined, {})).toBe(1)
    expect(laneCount(undefined, { VERIFY_PARALLEL_LANES: '4' })).toBe(4)
    expect(laneCount(2, { VERIFY_PARALLEL_LANES: '4' })).toBe(2)
    for (const bad of ['0', '9', '2.5', 'x']) expect(() => laneCount(undefined, { VERIFY_PARALLEL_LANES: bad })).toThrow(/from 1 to 8/)
  })

  it('separates exact spec files from options, keeping option values and the e2e mode token', () => {
    const root = checkout(['e2e-tests/a.spec.ts', 'e2e-tests/b.spec.ts'])
    expect(splitFileArgs(['e2e', 'e2e-tests/a.spec.ts', '--grep', '@webkit', '--browser=webkit', 'e2e-tests/b.spec.ts', '--requirements', 'req.json'], root))
      .toEqual({ files: ['e2e-tests/a.spec.ts', 'e2e-tests/b.spec.ts'], options: ['e2e', '--grep', '@webkit', '--browser=webkit', '--requirements', 'req.json'] })
    expect(splitFileArgs([], root)).toEqual({ files: [], options: [] })
    expect(splitFileArgs(['e2e-tests/a.spec.ts:12'], root).files).toBeNull()
    expect(splitFileArgs(['encyclopedia'], root).files).toBeNull()
    expect(splitFileArgs(['e2e-tests/missing.spec.ts'], root).files).toBeNull()
  })

  it('packs exact files into lanes by weight and keeps Playwright shards for patterns', () => {
    const root = checkout(['e2e-tests/a.spec.ts', 'e2e-tests/b.spec.ts', 'e2e-tests/c.spec.ts'])
    const weights = { 'e2e-tests/a.spec.ts': 9, 'e2e-tests/b.spec.ts': 5, 'e2e-tests/c.spec.ts': 4 }
    const files = ['e2e-tests/a.spec.ts', 'e2e-tests/b.spec.ts', 'e2e-tests/c.spec.ts']
    expect(laneArguments(['--browser=chromium', ...files], files, 2, root, weights))
      .toEqual([['--browser=chromium', 'e2e-tests/a.spec.ts'], ['--browser=chromium', 'e2e-tests/b.spec.ts', 'e2e-tests/c.spec.ts']])
    // A full-suite run (no files) packs the listed files too; more lanes than files leaves no empty lane.
    expect(laneArguments([], files, 4, root, weights)).toHaveLength(3)
    expect(laneArguments(['encyclopedia'], files, 2, root, weights)).toEqual([['encyclopedia', '--shard=1/2'], ['encyclopedia', '--shard=2/2']])
  })
})

describe('hosted frontend reuse', () => {
  function parent(env: NodeJS.ProcessEnv) {
    const root = checkout([])
    mkdirSync(join(root, 'dist')); writeFileSync(join(root, 'dist/frontend-build.json'), '{}\n')
    writeHostedFrontendMarker(root, head, 'f'.repeat(64), env)
    return root
  }
  it('reuses only a parent build of the same commit, sources and build environment', () => {
    const env = { VITE_SANDBOX_EXECUTOR: 'server', RELEASE_CHANNEL: 'stable', PATH: '/bin' }
    const root = parent(env)
    // Lanes add service and selection variables that never change the bundle.
    expect(hostedFrontendMismatch(root, head, 'f'.repeat(64), { ...env, PATH: '/usr/bin', BACKEND_PORT: '20001', E2E_DEPENDENCIES_READY: '1', E2E_EXTENDED: '1' })).toBeNull()
    expect(hostedFrontendMismatch(root, head, 'e'.repeat(64), env)).toBe('parent build sources differ')
    expect(hostedFrontendMismatch(root, 'b'.repeat(40), 'f'.repeat(64), env)).toBe('parent build is for another commit')
    expect(hostedFrontendMismatch(root, head, 'f'.repeat(64), { ...env, VITE_SANDBOX_EXECUTOR: 'browser' })).toBe('parent build environment differs')
    expect(hostedFrontendMismatch(root, head, 'f'.repeat(64), { ...env, PUBLIC_ASSET_VALIDATION_DIR: '/assets' })).toBe('parent build environment differs')
    rmSync(join(root, 'dist'), { recursive: true })
    expect(hostedFrontendMismatch(root, head, 'f'.repeat(64), env)).toBe('no parent build')
    expect(hostedFrontendMismatch(checkout([]), head, 'f'.repeat(64), env)).toBe('no parent build')
  })
})

describe('test port ranges', () => {
  it('narrows allocation to a validated sub-range', () => {
    expect(testPortRange({})).toEqual([20000, 32767])
    expect(testPortRange({ TEST_PORT_RANGE: '24000-25999' })).toEqual([24000, 25999])
    for (const bad of ['19000-20000', '30000-33000', '24000-24010', 'x']) expect(() => testPortRange({ TEST_PORT_RANGE: bad })).toThrow(/TEST_PORT_RANGE/)
  })
})
