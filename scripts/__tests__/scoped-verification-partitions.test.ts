import { describe, expect, it } from 'vitest'
import type { PlannedCheck, VerificationPlan } from '../ci/verification-plan'
import { routinePartitionManifest, routinePartitions } from '../ci/routine-partitions'

const plan = (checks: PlannedCheck[]): VerificationPlan => ({
  schemaVersion: 1, status: 'planned', mode: 'scoped',
  identity: { baseRef: 'main', headRef: 'HEAD', baseSha: '1'.repeat(40), mergeBaseSha: '1'.repeat(40),
    headSha: '2'.repeat(40), testedSha: '2'.repeat(40), sourceFingerprint: '3'.repeat(64) },
  changes: [], inventory: { vitest: [], browser: [] }, selections: [], expansionReasons: [], wideningReasons: [], checks,
})

describe('canonical scoped execution partitions', () => {
  it('balances selected files across three jobs regardless of project and input order', () => {
    const checks: PlannedCheck[] = [
      { kind: 'vitest', project: 'fast-client', files: ['b.test.ts', 'a.test.ts'] },
      { kind: 'vitest', project: 'slow', files: ['e.test.ts', 'c.test.ts', 'd.test.ts'] },
    ]
    const partitions = routinePartitions(plan(checks))
    expect(partitions.map(partition => ({ id: partition.id, checks: partition.checks }))).toEqual([
      { id: 'units-1', checks: [
        { kind: 'vitest', project: 'fast-client', files: ['a.test.ts'] },
        { kind: 'vitest', project: 'slow', files: ['d.test.ts'] },
      ] },
      { id: 'units-2', checks: [
        { kind: 'vitest', project: 'fast-client', files: ['b.test.ts'] },
        { kind: 'vitest', project: 'slow', files: ['e.test.ts'] },
      ] },
      { id: 'units-3', checks: [{ kind: 'vitest', project: 'slow', files: ['c.test.ts'] }] },
    ])
    const reversed = [...checks].reverse().map(check => check.kind === 'catalog' ? check : { ...check, files: [...check.files].reverse() })
    expect(routinePartitions(plan(reversed))).toEqual(partitions)
  })

  it('leaves empty slots unused for a single file and a catalog-only plan', () => {
    const manifest = routinePartitionManifest(routinePartitions(plan([
      { kind: 'vitest', project: 'fast-scripts', files: ['docs.test.ts'] },
    ])))
    expect(manifest).toMatchObject({
      'units-1': { id: 'units-1', checks: 1 }, 'units-2': null, 'units-3': null,
      'browser-1': null, 'browser-2': null, 'browser-3': null, 'browser-4': null,
    })
    expect(routinePartitionManifest(routinePartitions(plan([{ kind: 'catalog', taskId: 'fast' }]))))
      .toEqual({
        'units-1': null, 'units-2': null, 'units-3': null,
        'browser-1': null, 'browser-2': null, 'browser-3': null, 'browser-4': null,
      })
  })

  it('balances browser tuples across four jobs while retaining engine and grep', () => {
    const checks: PlannedCheck[] = [
      { kind: 'browser', browser: 'chromium', files: ['c.spec.ts', 'a.spec.ts', 'b.spec.ts'], grep: null },
      { kind: 'browser', browser: 'webkit', files: ['e.spec.ts', 'd.spec.ts'], grep: '@webkit' },
    ]
    const partitions = routinePartitions(plan(checks))
    expect(partitions.map(partition => ({ id: partition.id, checks: partition.checks }))).toEqual([
      { id: 'browser-1', checks: [
        { kind: 'browser', browser: 'chromium', files: ['a.spec.ts'], grep: null },
        { kind: 'browser', browser: 'webkit', files: ['e.spec.ts'], grep: '@webkit' },
      ] },
      { id: 'browser-2', checks: [{ kind: 'browser', browser: 'chromium', files: ['b.spec.ts'], grep: null }] },
      { id: 'browser-3', checks: [{ kind: 'browser', browser: 'chromium', files: ['c.spec.ts'], grep: null }] },
      { id: 'browser-4', checks: [{ kind: 'browser', browser: 'webkit', files: ['d.spec.ts'], grep: '@webkit' }] },
    ])
    const reversed = [...checks].reverse().map(check => check.kind === 'catalog' ? check : { ...check, files: [...check.files].reverse() })
    expect(routinePartitions(plan(reversed))).toEqual(partitions)
  })

  it('keeps distinct selectors of the same file and rejects duplicate tuples', () => {
    const partitions = routinePartitions(plan([
      { kind: 'browser', browser: 'chromium', files: ['same.spec.ts'], grep: '@mobile' },
      { kind: 'browser', browser: 'chromium', files: ['same.spec.ts'], grep: '@desktop' },
      { kind: 'browser', browser: 'webkit', files: ['same.spec.ts'], grep: null },
    ]))
    const checks = partitions.flatMap<PlannedCheck>(partition => partition.checks)
    expect(checks).toHaveLength(3)
    expect(checks).toEqual(expect.arrayContaining([
      { kind: 'browser', browser: 'chromium', files: ['same.spec.ts'], grep: '@desktop' },
      { kind: 'browser', browser: 'chromium', files: ['same.spec.ts'], grep: '@mobile' },
      { kind: 'browser', browser: 'webkit', files: ['same.spec.ts'], grep: null },
    ]))
    expect(() => routinePartitions(plan([
      { kind: 'browser', browser: 'chromium', files: ['same.spec.ts', 'same.spec.ts'], grep: '@one' },
    ]))).toThrow('Duplicate scoped browser selection')
  })
})
