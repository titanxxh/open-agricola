import { describe, expect, it } from 'vitest'
import type { TestConsumerIndex } from '../ci/test-consumers'
import { planVerification, type TestInventory } from '../ci/verification-plan'
import { FULL_TASK_IDS } from '../ci/verification-tasks'

const identity = {
  baseRef: 'main', headRef: 'HEAD', baseSha: '1'.repeat(40), mergeBaseSha: '1'.repeat(40),
  headSha: '2'.repeat(40), testedSha: '2'.repeat(40), sourceFingerprint: '3'.repeat(64),
}
const serverFiles = [
  'server/__tests__/operations-accounts.test.ts', 'server/__tests__/operations-openings.test.ts',
  'server/game/persistence/__tests__/opening-facts.test.ts', 'server/__tests__/observability-http.test.ts',
]
const scriptFiles = [
  'scripts/__tests__/operations-deployment.test.ts', 'scripts/__tests__/local-services.test.ts',
  'scripts/__tests__/wechat-community.test.ts',
]
const inventory: TestInventory = {
  vitest: [
    ...serverFiles.map(file => ({ project: 'fast-server', file })),
    ...scriptFiles.map(file => ({ project: 'fast-scripts', file })),
    { project: 'fast-server', file: 'server/__tests__/auth.test.ts' },
    { project: 'fast-client', file: 'client/__tests__/unrelated.test.ts' },
  ],
  browser: ['e2e-tests/operations-dashboard.spec.ts', 'e2e-tests/wechat-community.spec.ts', 'e2e-tests/unrelated.spec.ts'],
}
const index = (tests = inventory): TestConsumerIndex => ({
  inventoryKey: JSON.stringify(tests), expansionReasons: [],
  tests: [...tests.vitest.map(test => test.file), ...tests.browser].map(file => ({
    file, dependencies: [file], symbols: [], literals: [], uncertaintyReasons: [],
  })),
})
const plan = (path: string, consumers?: TestConsumerIndex, tests = inventory) => planVerification({
  identity, changes: [{ status: 'M', path }], inventory: tests, fullTaskIds: FULL_TASK_IDS, testConsumers: consumers,
})
const selectedFiles = (selected: ReturnType<typeof plan>) => selected.checks.flatMap(check => check.kind === 'vitest' ? check.files : [])

describe('operations behavior verification', () => {
  it.each([
    'operations/opening-metrics.ts', 'operations/accounts-exporter.ts', 'operations/database-access.ts',
    'operations/deploy.mjs', 'operations/prometheus.mjs', 'operations/compose.prod.yml',
    'operations/grafana/dashboards/new-dashboard.json',
  ])('retains complete declared behavior and browser files for %s without unrelated server tests', path => {
    const selected = plan(path, index())
    expect(selected.mode).toBe('scoped')
    expect(selectedFiles(selected).sort()).toEqual([...serverFiles, ...scriptFiles].sort())
    expect(selected.checks.filter(check => check.kind === 'browser')).toEqual([{
      kind: 'browser', browser: 'chromium', grep: null,
      files: ['e2e-tests/operations-dashboard.spec.ts', 'e2e-tests/wechat-community.spec.ts'],
    }])
    expect(selected.checks.filter(check => check.kind === 'catalog')).toEqual([
      { kind: 'catalog', taskId: 'quality' }, { kind: 'catalog', taskId: 'build' },
    ])
  })

  it('automatically includes discovered dependencies, prefixes, script bridges and literal operation paths', () => {
    const additions = [
      { project: 'fast-client', file: 'client/__tests__/external-metric.test.ts' },
      { project: 'fast-server', file: 'server/__tests__/ops-new.test.ts' },
      { project: 'fast-scripts', file: 'scripts/__tests__/monitoring-config.test.ts' },
      { project: 'fast-tests', file: 'tests/dashboard-file.test.ts' },
    ]
    const tests = { ...inventory, vitest: [...inventory.vitest, ...additions] }
    const consumers = index(tests)
    for (const test of consumers.tests) {
      if (test.file === additions[0].file) test.dependencies.push('operations/opening-metrics.ts')
      if (test.file === additions[2].file) test.dependencies.push('scripts/observability.mjs')
      if (test.file === additions[3].file) test.literals.push('operations/grafana/dashboards/players.json')
    }
    const selected = plan('operations/opening-metrics.ts', consumers, tests)
    expect(selectedFiles(selected).sort()).toEqual([...serverFiles, ...scriptFiles, ...additions.map(test => test.file)].sort())
  })

  it('keeps an accompanying operations regression test distinct from a server production module', () => {
    const selected = planVerification({
      identity, changes: [
        { status: 'M', path: 'operations/opening-metrics.ts' },
        { status: 'M', path: 'server/__tests__/operations-accounts.test.ts' },
      ], inventory, fullTaskIds: FULL_TASK_IDS, testConsumers: index(),
    })
    expect(selected.selections.map(selection => selection.scope)).toEqual(['operations', 'test-support'])
    expect(selectedFiles(selected).sort()).toEqual([...serverFiles, ...scriptFiles].sort())
    expect(selectedFiles(selected)).not.toContain('server/__tests__/auth.test.ts')
  })

  it('retains complete unknown loader consumers with an explicit bounded reason without treating generic filesystem setup as ownership', () => {
    const consumers = index()
    for (const test of consumers.tests) {
      if (test.file === 'client/__tests__/unrelated.test.ts') test.uncertaintyReasons.push(`Computed module consumer: ${test.file}`)
      if (test.file === 'server/__tests__/auth.test.ts') {
        test.uncertaintyReasons.push('Filesystem or glob consumer: server/__tests__/_helpers/postgres.ts')
        test.literals.push('docs/operations/ci-checks.md')
      }
    }
    const selected = plan('operations/opening-metrics.ts', consumers)
    expect(selectedFiles(selected)).toContain('client/__tests__/unrelated.test.ts')
    expect(selectedFiles(selected)).not.toContain('server/__tests__/auth.test.ts')
    expect(selected.wideningReasons).toEqual([expect.stringContaining('client/__tests__/unrelated.test.ts')])
    expect(selected.expansionReasons).toEqual([])
  })

  it('keeps a complete inventory and browser fallback when the pure plan API has no independent index', () => {
    const selected = plan('operations/opening-metrics.ts')
    expect(selected.mode).toBe('scoped')
    expect(selectedFiles(selected).sort()).toEqual(inventory.vitest.map(test => test.file).sort())
    expect(selected.checks).toContainEqual({ kind: 'catalog', taskId: 'chromium-1' })
    expect(selected.checks).toContainEqual({ kind: 'catalog', taskId: 'webkit' })
    expect(selected.wideningReasons).toEqual([expect.stringContaining('consumer evidence is missing')])
  })

  it.each([
    'operations/update-community-qr.mjs', 'operations/new-entry.ts', 'operations/build-player-dashboard.mjs',
  ])('requires full verification for undeclared or cross-UI operations entry %s', path => {
    const selected = plan(path, index())
    expect(selected.mode).toBe('full')
    expect(selected.expansionReasons).toEqual([expect.stringContaining(path)])
  })

  it.each([...serverFiles, ...scriptFiles, ...inventory.browser.slice(0, 2)])('fails rather than hiding a missing declared consumer %s', missing => {
    const tests = { vitest: inventory.vitest.filter(test => test.file !== missing), browser: inventory.browser.filter(file => file !== missing) }
    expect(() => plan('operations/opening-metrics.ts', index(tests), tests)).toThrow(missing)
  })

  it.each(['server/database/031-game-opening-facts.sql', 'server/operations-accounts.ts', 'server/operations-openings.ts'])(
    'keeps the complete prior server group for producer path %s', path => {
      const selected = plan(path, index())
      expect(selectedFiles(selected).sort()).toEqual(inventory.vitest.filter(test => test.project === 'fast-server').map(test => test.file).sort())
    },
  )

  it('fails confirmed independent consumer evidence errors instead of replacing them with a full plan', () => {
    const consumers = index()
    consumers.expansionReasons.push('Cannot inspect test consumer evidence server/__tests__/_helpers/broken.ts: malformed source')
    expect(() => plan('operations/opening-metrics.ts', consumers)).toThrow('Cannot establish test consumer evidence')
  })
})
