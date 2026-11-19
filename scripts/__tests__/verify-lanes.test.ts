import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { canonicalOwnerLocalCommands } from '../ci/owner-local-verification'
import { browserSpecWeightsAt, verificationConfiguration, weightedAssignment } from '../ci/verification-tasks'
import { testPortRange } from '../test-ports'
import { HOSTED_FRONTEND_SOURCE, hostedFrontendCommand, hostedFrontendMismatch, hostedFrontendStep, laneArguments, laneCount, splitFileArgs, viteDotenv, writeHostedFrontendMarker } from '../verify-lanes'

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
    mkdirSync(join(root, 'dist/assets'), { recursive: true }); writeFileSync(join(root, 'dist/frontend-build.json'), '{}\n')
    writeFileSync(join(root, 'dist/index.html'), 'source build\n'); writeFileSync(join(root, 'dist/assets/index.js'), 'server executor\n')
    writeHostedFrontendMarker(root, head, 'f'.repeat(64), env)
    return root
  }
  it('reuses only a parent build of the same commit, sources and build environment', () => {
    const env = { VITE_ENABLE_COMMUNITY_DECK: 'false', RELEASE_CHANNEL: 'stable', PATH: '/bin' }
    const root = parent(env)
    // Lanes add service and selection variables that never change the bundle.
    expect(hostedFrontendMismatch(root, head, 'f'.repeat(64), { ...env, PATH: '/usr/bin', BACKEND_PORT: '20001', E2E_DEPENDENCIES_READY: '1', E2E_EXTENDED: '1' })).toBeNull()
    expect(hostedFrontendMismatch(root, head, 'e'.repeat(64), env)).toBe('parent build sources differ')
    expect(hostedFrontendMismatch(root, 'b'.repeat(40), 'f'.repeat(64), env)).toBe('parent build is for another commit')
    expect(hostedFrontendMismatch(root, head, 'f'.repeat(64), { ...env, VITE_ENABLE_COMMUNITY_DECK: 'true' })).toBe('parent build environment differs')
    expect(hostedFrontendMismatch(root, head, 'f'.repeat(64), { ...env, PUBLIC_ASSET_VALIDATION_DIR: '/assets' })).toBe('parent build environment differs')
    // The local asset checkout steers the development server each lane starts; a lane only reuses a parent of the same choice.
    expect(hostedFrontendMismatch(root, head, 'f'.repeat(64), { ...env, E2E_PUBLIC_ASSET_DIR: '/assets' })).toBe('parent build environment differs')
    // Ignored dotenv files feed the Vite build; a lane's own (absent) files must match the parent's.
    const lane = checkout([])
    expect(hostedFrontendMismatch(root, head, 'f'.repeat(64), env, viteDotenv(lane))).toBeNull()
    writeFileSync(join(lane, '.env.production.local'), 'VITE_ENABLE_DEV_AUTH_SHORTCUTS=1\n')
    expect(hostedFrontendMismatch(root, head, 'f'.repeat(64), env, viteDotenv(lane))).toBe('parent build dotenv files differ')
    const dotenvParent = checkout([])
    mkdirSync(join(dotenvParent, 'dist')); writeFileSync(join(dotenvParent, 'dist/frontend-build.json'), '{}\n')
    writeFileSync(join(dotenvParent, '.env'), 'VITE_ENABLE_DEV_AUTH_SHORTCUTS=1\n')
    writeHostedFrontendMarker(dotenvParent, head, 'f'.repeat(64), env)
    expect(hostedFrontendMismatch(dotenvParent, head, 'f'.repeat(64), env, viteDotenv(checkout([])))).toBe('parent build dotenv files differ')
    rmSync(join(root, 'dist'), { recursive: true })
    expect(hostedFrontendMismatch(root, head, 'f'.repeat(64), env)).toBe('no parent build')
    expect(hostedFrontendMismatch(checkout([]), head, 'f'.repeat(64), env)).toBe('no parent build')
  })

  // Records pnpm commands instead of running them; every checkout here is at `head` with the same sources.
  const recording = (calls: string[][]) => ({ run: (command: string, args: string[], cwd: string) => { calls.push([cwd, command, ...args]); return 0 },
    head: () => head, fingerprint: async () => 'f'.repeat(64) })

  it('copies a named build that matches exactly, builds otherwise, and keeps a named build that is the checkout itself', async () => {
    const env = { VITE_ENABLE_COMMUNITY_DECK: 'false', RELEASE_CHANNEL: 'stable' }
    const source = parent(env)
    const lane = checkout([]); mkdirSync(join(lane, 'dist')); writeFileSync(join(lane, 'dist/stale.js'), 'stale\n')
    // verify-parallel's root and verify.ts take the reuse step only while a source build is named.
    expect(hostedFrontendCommand(env)).toEqual(['run', 'build:hosted-frontend'])
    expect(hostedFrontendCommand({ ...env, [HOSTED_FRONTEND_SOURCE]: source })).toEqual(['exec', 'tsx', 'scripts/verify-lanes.ts', 'hosted-frontend'])
    const calls: string[][] = []
    // A match prepares only the generated dev-server inputs and replaces the checkout's bundle with the source's.
    expect(await hostedFrontendStep(lane, { ...env, [HOSTED_FRONTEND_SOURCE]: source }, recording(calls))).toBe(0)
    expect(calls).toEqual([[lane, 'pnpm', 'run', 'build:cards-manifest']])
    expect(readFileSync(join(lane, 'dist/index.html'), 'utf8')).toBe('source build\n')
    expect(existsSync(join(lane, 'dist/stale.js'))).toBe(false)
    // A different Vite build variable changes the bundle, and without a named source the step is the plain build.
    calls.length = 0
    expect(await hostedFrontendStep(lane, { ...env, VITE_ENABLE_COMMUNITY_DECK: 'true', [HOSTED_FRONTEND_SOURCE]: source }, recording(calls))).toBe(0)
    expect(await hostedFrontendStep(lane, env, recording(calls))).toBe(0)
    expect(calls).toEqual([[lane, 'pnpm', 'run', 'build:hosted-frontend'], [lane, 'pnpm', 'run', 'build:hosted-frontend']])
    // Naming the checkout itself, directly or through a symlink, never removes the build it would copy.
    calls.length = 0
    const alias = join(checkout([]), 'alias'); symlinkSync(source, alias)
    for (const named of [source, alias]) expect(await hostedFrontendStep(source, { ...env, [HOSTED_FRONTEND_SOURCE]: named }, recording(calls))).toBe(0)
    expect(calls).toEqual([[source, 'pnpm', 'run', 'build:cards-manifest'], [source, 'pnpm', 'run', 'build:cards-manifest']])
    expect(readFileSync(join(source, 'dist/index.html'), 'utf8')).toBe('source build\n')
    expect(hostedFrontendMismatch(source, head, 'f'.repeat(64), env)).toBeNull()
    // A later rebuild here (say for the browser-local sandbox) leaves the marker describing a bundle that is gone.
    writeFileSync(join(source, 'dist/assets/index.js'), 'browser executor\n')
    calls.length = 0
    expect(hostedFrontendMismatch(source, head, 'f'.repeat(64), env)).toBe('parent build output changed after it was marked')
    expect(await hostedFrontendStep(source, { ...env, [HOSTED_FRONTEND_SOURCE]: source }, recording(calls))).toBe(0)
    expect(calls).toEqual([[source, 'pnpm', 'run', 'build:hosted-frontend']])
  })
})

describe('test port ranges', () => {
  it('narrows allocation to a validated sub-range', () => {
    expect(testPortRange({})).toEqual([20000, 32767])
    expect(testPortRange({ TEST_PORT_RANGE: '24000-25999' })).toEqual([24000, 25999])
    for (const bad of ['19000-20000', '30000-33000', '24000-24010', 'x']) expect(() => testPortRange({ TEST_PORT_RANGE: bad })).toThrow(/TEST_PORT_RANGE/)
  })
})

describe('history-preserving catalog changes', () => {
  // A minimal repository whose commits differ only in the files that matter here.
  function repository() {
    const root = mkdtempSync(join(tmpdir(), 'oa-catalog-history-')); roots.push(root)
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
    git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't')
    mkdirSync(join(root, '.github/workflows'), { recursive: true }); mkdirSync(join(root, 'scripts/ci'), { recursive: true }); mkdirSync(join(root, 'e2e-tests'))
    for (const file of ['.github/workflows/candidate-verification.yml', 'scripts/ci/verification-tasks.ts', 'scripts/ci/candidate-verification.ts', 'pnpm-lock.yaml']) writeFileSync(join(root, file), file)
    writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { 'check:architecture': 'pnpm run lint' } }))
    for (const name of ['a', 'b', 'c', 'd', 'e']) writeFileSync(join(root, 'e2e-tests', `${name}.spec.ts`), '// spec\n')
    writeFileSync(join(root, 'scripts/verify-parallel.mjs'), 'one\n')
    git('add', '.'); git('commit', '-qm', 'legacy catalog')
    const legacy = git('rev-parse', 'HEAD')
    writeFileSync(join(root, 'scripts/verify-parallel.mjs'), 'two\n')
    git('commit', '-qam', 'runner edit before weights')
    const legacyEdited = git('rev-parse', 'HEAD')
    writeFileSync(join(root, 'scripts/ci/browser-spec-weights.json'), JSON.stringify({ format: 1, files: { 'e2e-tests/a.spec.ts': 40, 'e2e-tests/b.spec.ts': 30 } }))
    git('add', '.'); git('commit', '-qm', 'weighted catalog')
    const weighted = git('rev-parse', 'HEAD')
    writeFileSync(join(root, 'scripts/verify-parallel.mjs'), 'three\n')
    git('commit', '-qam', 'runner edit after weights')
    return { root, legacy, legacyEdited, weighted, weightedEdited: git('rev-parse', 'HEAD') }
  }

  it('keeps earlier hashes: the lane runner counts only in trees that carry the weight table', () => {
    const value = repository()
    expect(verificationConfiguration(value.root, value.legacyEdited)).toBe(verificationConfiguration(value.root, value.legacy))
    expect(verificationConfiguration(value.root, value.weightedEdited)).not.toBe(verificationConfiguration(value.root, value.weighted))
  })

  it('reproduces each producer catalog: index-modulo verify before the weight table, weighted lanes after it', () => {
    const value = repository()
    expect(browserSpecWeightsAt(value.root, value.legacy)).toBeNull()
    expect(canonicalOwnerLocalCommands(value.root, value.weighted, 'prerelease', value.legacy)['chromium-1'])
      .toEqual([{ command: 'pnpm', args: ['verify', 'e2e-tests/a.spec.ts', 'e2e-tests/e.spec.ts'] }])
    const weighted = canonicalOwnerLocalCommands(value.root, value.weighted, 'prerelease', value.weighted)
    // a(40), then c/d/e at the median 40 by path, then b(30) into the lightest task.
    expect(weighted['chromium-1']).toEqual([{ command: 'pnpm', args: ['verify:parallel', 'e2e-tests/a.spec.ts', 'e2e-tests/b.spec.ts'] }])
    expect(['chromium-1', 'chromium-2', 'chromium-3', 'chromium-4'].flatMap(id => weighted[id as 'chromium-1'].flatMap(command => command.args.slice(1))).sort())
      .toEqual(['a', 'b', 'c', 'd', 'e'].map(name => `e2e-tests/${name}.spec.ts`))
  })
})
