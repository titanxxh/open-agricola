import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { globSync } from 'glob'
import { afterEach, describe, expect, it } from 'vitest'
import type { PlannedCheck, VerificationPlan } from '../ci/verification-plan'
import { routinePartitionManifest, routinePartitions } from '../ci/routine-partitions'
import { BASE_EXCLUDE, FAST_PROJECT_GLOBS, SLOW_INCLUDE } from '../test-project-globs'

const plan = (checks: PlannedCheck[]): VerificationPlan => ({
  schemaVersion: 1, status: 'planned', mode: 'scoped',
  identity: { baseRef: 'main', headRef: 'HEAD', baseSha: '1'.repeat(40), mergeBaseSha: '1'.repeat(40),
    headSha: '2'.repeat(40), testedSha: '2'.repeat(40), sourceFingerprint: '3'.repeat(64) },
  changes: [], inventory: { vitest: [], browser: [] }, selections: [], expansionReasons: [], wideningReasons: [], checks,
})

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

function durations(value: Record<string, number>): string {
  const root = mkdtempSync(join(tmpdir(), 'routine-partitions-'))
  roots.push(root)
  mkdirSync(join(root, 'scripts/ci'), { recursive: true })
  writeFileSync(join(root, 'scripts/ci/verification-durations.json'), JSON.stringify(value))
  return root
}

describe('canonical scoped execution partitions', () => {
  it('splits selected Vitest files into at most three duration-balanced jobs and skips an empty slot', () => {
    const root = durations({
      'client/tall.test.ts': 50,
      'client/short.test.ts': 10,
      'server/base.test.ts': 5,
    })
    const checks: PlannedCheck[] = [
      { kind: 'vitest', project: 'fast-client', files: ['client/mid.test.ts', 'client/short.test.ts', 'client/tall.test.ts'] },
      { kind: 'vitest', project: 'fast-server', files: ['server/plain.test.ts', 'server/base.test.ts'] },
    ]
    const partitions = routinePartitions(plan(checks), root)

    expect(partitions.map(partition => ({ id: partition.id, checks: partition.checks }))).toEqual([
      { id: 'units-1', checks: [{ kind: 'vitest', project: 'fast-client', files: ['client/tall.test.ts'] }] },
      { id: 'units-2', checks: [{ kind: 'vitest', project: 'fast-client', files: ['client/mid.test.ts'] }] },
      { id: 'units-3', checks: [
        { kind: 'vitest', project: 'fast-client', files: ['client/short.test.ts'] },
        { kind: 'vitest', project: 'fast-server', files: ['server/base.test.ts', 'server/plain.test.ts'] },
      ] },
    ])
    const reversed = [...checks].reverse().map(check => check.kind === 'catalog' ? check : { ...check, files: [...check.files].reverse() })
    expect(routinePartitions(plan(reversed), root)).toEqual(partitions)
  })

  it('leaves later Vitest slots unused when the selection fits in one job', () => {
    const manifest = routinePartitionManifest(routinePartitions(plan([
      { kind: 'vitest', project: 'fast-scripts', files: ['docs.test.ts'] },
    ]), durations({})))

    expect(manifest).toMatchObject({
      'units-1': { id: 'units-1', checks: 1 }, 'units-2': null, 'units-3': null,
      'browser-1': null, 'browser-2': null, 'browser-3': null, 'browser-4': null,
    })
    expect(routinePartitionManifest(routinePartitions(plan([{ kind: 'catalog', taskId: 'fast' }]), durations({}))))
      .toEqual({
        'units-1': null, 'units-2': null, 'units-3': null,
        'browser-1': null, 'browser-2': null, 'browser-3': null, 'browser-4': null,
      })
  })

  it('packs browser tuples into the same four slots by duration, including an unmeasured spec', () => {
    const root = durations({ 'tall.spec.ts': 50, 'short.spec.ts': 10 })
    const checks: PlannedCheck[] = [
      { kind: 'browser', browser: 'chromium', files: ['short.spec.ts', 'tall.spec.ts'], grep: null },
      { kind: 'browser', browser: 'webkit', files: ['mid.spec.ts', 'other.spec.ts'], grep: '@webkit' },
    ]
    const partitions = routinePartitions(plan(checks), root)

    expect(partitions.map(partition => ({ id: partition.id, checks: partition.checks }))).toEqual([
      { id: 'browser-1', checks: [{ kind: 'browser', browser: 'chromium', files: ['tall.spec.ts'], grep: null }] },
      { id: 'browser-2', checks: [{ kind: 'browser', browser: 'webkit', files: ['mid.spec.ts'], grep: '@webkit' }] },
      { id: 'browser-3', checks: [{ kind: 'browser', browser: 'webkit', files: ['other.spec.ts'], grep: '@webkit' }] },
      { id: 'browser-4', checks: [{ kind: 'browser', browser: 'chromium', files: ['short.spec.ts'], grep: null }] },
    ])
    expect(routinePartitionManifest(partitions)['browser-1']).toMatchObject({ id: 'browser-1', checks: 1 })
    const reversed = [...checks].reverse().map(check => check.kind === 'catalog' ? check : { ...check, files: [...check.files].reverse() })
    expect(routinePartitions(plan(reversed), root)).toEqual(partitions)
  })

  it('keeps one slow browser tuple out of the slots that share the remaining files', () => {
    const root = durations({
      'whale.spec.ts': 100, 'a.spec.ts': 10, 'b.spec.ts': 10, 'c.spec.ts': 10, 'tail.spec.ts': 10,
    })
    const partitions = routinePartitions(plan([
      { kind: 'browser', browser: 'chromium', files: ['a.spec.ts', 'b.spec.ts', 'c.spec.ts', 'tail.spec.ts', 'whale.spec.ts'], grep: null },
    ]), root)

    expect(partitions.map(partition => partition.checks)).toEqual([
      [{ kind: 'browser', browser: 'chromium', files: ['whale.spec.ts'], grep: null }],
      [{ kind: 'browser', browser: 'chromium', files: ['a.spec.ts', 'tail.spec.ts'], grep: null }],
      [{ kind: 'browser', browser: 'chromium', files: ['b.spec.ts'], grep: null }],
      [{ kind: 'browser', browser: 'chromium', files: ['c.spec.ts'], grep: null }],
    ])
  })

  it('packs Vitest files with no file measurement by the committed project median', () => {
    const root = durations({
      'e2e-tests/login.spec.ts': 5_000,
      'vitest-project:fast-shared': 10,
      'vitest-project:slow': 100,
    })
    const partitions = routinePartitions(plan([
      { kind: 'vitest', project: 'fast-shared', files: ['a.test.ts', 'b.test.ts', 'c.test.ts', 'd.test.ts'] },
      { kind: 'vitest', project: 'slow', files: ['whale.test.ts'] },
    ]), root)

    expect(partitions.map(partition => ({ id: partition.id, checks: partition.checks }))).toEqual([
      { id: 'units-1', checks: [{ kind: 'vitest', project: 'slow', files: ['whale.test.ts'] }] },
      { id: 'units-2', checks: [{ kind: 'vitest', project: 'fast-shared', files: ['a.test.ts', 'c.test.ts'] }] },
      { id: 'units-3', checks: [{ kind: 'vitest', project: 'fast-shared', files: ['b.test.ts', 'd.test.ts'] }] },
    ])
  })

  it('keeps a recorded Vitest file on its own duration instead of the project median', () => {
    const root = durations({
      'vitest-project:fast-shared': 100,
      'vitest-project:slow': 40,
      'shared/recorded.test.ts': 5,
    })
    const partitions = routinePartitions(plan([
      { kind: 'vitest', project: 'fast-shared', files: ['shared/recorded.test.ts'] },
      { kind: 'vitest', project: 'slow', files: ['server/s1.test.ts', 'server/s2.test.ts', 'server/s3.test.ts', 'server/s4.test.ts', 'server/s5.test.ts', 'server/s6.test.ts'] },
    ]), root)

    expect(partitions.map(partition => ({ id: partition.id, checks: partition.checks }))).toEqual([
      { id: 'units-1', checks: [
        { kind: 'vitest', project: 'fast-shared', files: ['shared/recorded.test.ts'] },
        { kind: 'vitest', project: 'slow', files: ['server/s1.test.ts', 'server/s4.test.ts'] },
      ] },
      { id: 'units-2', checks: [{ kind: 'vitest', project: 'slow', files: ['server/s2.test.ts', 'server/s5.test.ts'] }] },
      { id: 'units-3', checks: [{ kind: 'vitest', project: 'slow', files: ['server/s3.test.ts', 'server/s6.test.ts'] }] },
    ])
  })

  it('keeps a recorded browser spec on its own duration when project medians are present', () => {
    const root = durations({
      'tall.spec.ts': 50,
      'short.spec.ts': 10,
      'vitest-project:fast-shared': 1_000,
    })
    const partitions = routinePartitions(plan([
      { kind: 'browser', browser: 'chromium', files: ['short.spec.ts', 'tall.spec.ts'], grep: null },
      { kind: 'browser', browser: 'webkit', files: ['mid.spec.ts', 'other.spec.ts'], grep: '@webkit' },
    ]), root)

    expect(partitions.map(partition => ({ id: partition.id, checks: partition.checks }))).toEqual([
      { id: 'browser-1', checks: [{ kind: 'browser', browser: 'chromium', files: ['tall.spec.ts'], grep: null }] },
      { id: 'browser-2', checks: [{ kind: 'browser', browser: 'webkit', files: ['mid.spec.ts'], grep: '@webkit' }] },
      { id: 'browser-3', checks: [{ kind: 'browser', browser: 'webkit', files: ['other.spec.ts'], grep: '@webkit' }] },
      { id: 'browser-4', checks: [{ kind: 'browser', browser: 'chromium', files: ['short.spec.ts'], grep: null }] },
    ])
  })

  it('balances an unmeasured fast file apart from lighter slow files using the committed catalog medians', () => {
    const partitions = routinePartitions(plan([
      { kind: 'vitest', project: 'fast-shared', files: ['shared/heavy.test.ts'] },
      { kind: 'vitest', project: 'slow', files: ['server/s1.test.ts', 'server/s2.test.ts', 'server/s3.test.ts', 'server/s4.test.ts', 'server/s5.test.ts', 'server/s6.test.ts'] },
    ]))

    expect(partitions.map(partition => ({ id: partition.id, checks: partition.checks }))).toEqual([
      { id: 'units-1', checks: [{ kind: 'vitest', project: 'fast-shared', files: ['shared/heavy.test.ts'] }] },
      { id: 'units-2', checks: [{ kind: 'vitest', project: 'slow', files: ['server/s1.test.ts', 'server/s3.test.ts', 'server/s5.test.ts'] }] },
      { id: 'units-3', checks: [{ kind: 'vitest', project: 'slow', files: ['server/s2.test.ts', 'server/s4.test.ts', 'server/s6.test.ts'] }] },
    ])
  })

  it('commits a per-file project median from the fast and slow catalog times', () => {
    const durations = JSON.parse(readFileSync(fileURLToPath(new URL('../ci/verification-durations.json', import.meta.url)), 'utf8')) as Record<string, number>
    const projects = [...FAST_PROJECT_GLOBS, { name: 'slow', include: SLOW_INCLUDE, exclude: BASE_EXCLUDE }]
    const discovered = projects.map(project => ({
      name: project.name,
      files: globSync(project.include, { cwd: fileURLToPath(new URL('../..', import.meta.url)), ignore: project.exclude, nodir: true, posix: true }),
    }))
    const counts = new Map(projects.map(project => [project.name, 0]))
    for (const file of new Set(discovered.flatMap(project => project.files))) {
      const owners = discovered.filter(project => project.files.includes(file))
      if (owners.length === 1) counts.set(owners[0].name, (counts.get(owners[0].name) ?? 0) + 1)
    }
    const fastFiles = [...counts].filter(([name]) => name !== 'slow').reduce((total, [, count]) => total + count, 0)
    const fastMedian = Math.round(900_000 / fastFiles)
    const slowMedian = Math.round(140_000 / (counts.get('slow') ?? 0))

    for (const [name, count] of counts) {
      expect(count, name).toBeGreaterThan(0)
      expect(durations[`vitest-project:${name}`], name).toBe(name === 'slow' ? slowMedian : fastMedian)
    }
    expect(durations['e2e-tests/ws-dual-player.spec.ts']).toBe(42_331)
  })

  it('rejects duplicate selected tuples instead of silently changing their execution scope', () => {
    expect(() => routinePartitions(plan([
      { kind: 'browser', browser: 'chromium', files: ['same.spec.ts', 'same.spec.ts'], grep: '@one' },
    ]), durations({}))).toThrow('Duplicate scoped browser selection')
  })
})
