import { describe, expect, it } from 'vitest'
import type { PlannedCheck, VerificationPlan } from '../ci/verification-plan'
import { routinePartitionManifest, routinePartitions } from '../ci/routine-partitions'

const plan = (checks: PlannedCheck[]): VerificationPlan => ({
  schemaVersion: 1, status: 'planned', mode: 'scoped',
  identity: { baseRef: 'main', headRef: 'HEAD', baseSha: '1'.repeat(40), mergeBaseSha: '1'.repeat(40),
    headSha: '2'.repeat(40), testedSha: '2'.repeat(40), sourceFingerprint: '3'.repeat(64) },
  changes: [], inventory: { vitest: [], browser: [] }, selections: [], expansionReasons: [], checks,
})

describe('canonical scoped execution partitions', () => {
  it('keeps complete unit files together and distributes selected browser files across four exact slots', () => {
    const partitions = routinePartitions(plan([
      { kind: 'vitest', project: 'fast-client', files: ['client/a.test.ts', 'client/b.test.ts'] },
      { kind: 'catalog', taskId: 'quality' },
      { kind: 'browser', browser: 'chromium', files: ['a.spec.ts', 'b.spec.ts', 'c.spec.ts', 'd.spec.ts', 'e.spec.ts'], grep: null },
      { kind: 'browser', browser: 'webkit', files: ['z.spec.ts'], grep: '@webkit' },
    ]))

    expect(partitions.map(partition => ({ id: partition.id, checks: partition.checks }))).toEqual([
      { id: 'units', checks: [{ kind: 'vitest', project: 'fast-client', files: ['client/a.test.ts', 'client/b.test.ts'] }] },
      { id: 'browser-1', checks: [{ kind: 'browser', browser: 'chromium', files: ['a.spec.ts', 'e.spec.ts'], grep: null }] },
      { id: 'browser-2', checks: [
        { kind: 'browser', browser: 'chromium', files: ['b.spec.ts'], grep: null },
        { kind: 'browser', browser: 'webkit', files: ['z.spec.ts'], grep: '@webkit' },
      ] },
      { id: 'browser-3', checks: [{ kind: 'browser', browser: 'chromium', files: ['c.spec.ts'], grep: null }] },
      { id: 'browser-4', checks: [{ kind: 'browser', browser: 'chromium', files: ['d.spec.ts'], grep: null }] },
    ])
    for (const partition of partitions) expect(partition.digest).toMatch(/^[a-f0-9]{64}$/)
  })

  it('retains each engine, grep and complete file tuple exactly once and independently of input order', () => {
    const checks: PlannedCheck[] = [
      { kind: 'browser', browser: 'chromium', files: ['same.spec.ts', 'odd $(touch marker).spec.ts'], grep: '@one' },
      { kind: 'browser', browser: 'chromium', files: ['same.spec.ts'], grep: '@two|@three' },
      { kind: 'browser', browser: 'chromium', files: ['full.spec.ts'], grep: null },
      { kind: 'browser', browser: 'webkit', files: ['same.spec.ts'], grep: '@one' },
      { kind: 'browser', browser: 'webkit', files: ['full.spec.ts'], grep: null },
    ]
    const partitions = routinePartitions(plan(checks))
    const actual = partitions.flatMap(partition => partition.checks.flatMap(check => check.kind === 'browser'
      ? check.files.map(file => [check.browser, check.grep, file]) : []))

    expect(actual).toHaveLength(6)
    expect(actual).toEqual(expect.arrayContaining([
      ['chromium', '@one', 'same.spec.ts'], ['chromium', '@one', 'odd $(touch marker).spec.ts'],
      ['chromium', '@two|@three', 'same.spec.ts'], ['chromium', null, 'full.spec.ts'],
      ['webkit', '@one', 'same.spec.ts'], ['webkit', null, 'full.spec.ts'],
    ]))
    const reversed = [...checks].reverse().map(check => check.kind === 'catalog' ? check : { ...check, files: [...check.files].reverse() })
    expect(routinePartitions(plan(reversed))).toEqual(partitions)
  })

  it('bounds a 35-file selector to at most nine complete files per browser slot', () => {
    const partitions = routinePartitions(plan([
      { kind: 'browser', browser: 'chromium', files: Array.from({ length: 35 }, (_, index) => `${index}.spec.ts`), grep: '@card' },
    ]))
    expect(partitions.map(partition => partition.checks.reduce((total, check) => total + check.files.length, 0)))
      .toEqual([9, 9, 9, 8])
  })

  it('uses explicit empty slots for documentation and full catalog plans', () => {
    const documentation = routinePartitionManifest(routinePartitions(plan([
      { kind: 'vitest', project: 'fast-scripts', files: ['docs.test.ts'] },
    ])))
    expect(documentation).toMatchObject({
      units: { id: 'units', checks: 1 }, 'browser-1': null, 'browser-2': null, 'browser-3': null, 'browser-4': null,
    })
    expect(routinePartitionManifest(routinePartitions({ ...plan([{ kind: 'catalog', taskId: 'fast' }]), mode: 'full' })))
      .toEqual({ units: null, 'browser-1': null, 'browser-2': null, 'browser-3': null, 'browser-4': null })
  })

  it('rejects duplicate selected tuples instead of silently changing their execution scope', () => {
    expect(() => routinePartitions(plan([
      { kind: 'browser', browser: 'chromium', files: ['same.spec.ts', 'same.spec.ts'], grep: '@one' },
    ]))).toThrow('Duplicate scoped browser selection')
  })
})
