import { describe, expect, it } from 'vitest'
import { assertConsumerCoverage, documentationVerification, supportVerification } from '../ci/support-verification'
import type { TestConsumerIndex } from '../ci/test-consumers'
import type { TestInventory } from '../ci/verification-plan'

const inventory: TestInventory = {
  vitest: [
    { file: 'scripts/__tests__/docs-budget.test.ts', project: 'fast-scripts' },
    { file: 'client/services/llm/generation/__tests__/references.test.ts', project: 'fast-client' },
    { file: 'server/__tests__/workshop-timing-payment-session.test.ts', project: 'fast-server' },
    { file: 'server/__tests__/workshop-composed-behaviors-session.test.ts', project: 'fast-server' },
    { file: 'server/__tests__/unrelated.test.ts', project: 'fast-server' },
  ],
  browser: ['e2e-tests/game-end.spec.ts', 'e2e-tests/ws-dual-player.spec.ts', 'e2e-tests/replay-viewer-csp.spec.ts'],
}
const evidence = (): TestConsumerIndex => ({
  inventoryKey: JSON.stringify(inventory), expansionReasons: [],
  tests: [...inventory.vitest.map(test => test.file), ...inventory.browser].map(file => ({
    file, dependencies: [file], symbols: [], literals: [], uncertaintyReasons: [],
  })),
})
const files = (checks: ReturnType<typeof documentationVerification>['checks']) => checks.flatMap(check => check.kind === 'catalog' ? [] : check.files)

describe('bounded test and document support scope', () => {
  it('keeps a Chinese architecture mirror inside documentation constraints', () => {
    const result = documentationVerification(['docs/architecture/client_zh.md'], inventory)
    expect(files(result.checks)).toEqual(['scripts/__tests__/docs-budget.test.ts'])
    expect(result.expansionReasons).toEqual([])
  })

  it('retains the English reference reader without running unrelated Workshop behavior', () => {
    const result = documentationVerification(['docs/architecture/client.md'], inventory)
    expect(files(result.checks)).toEqual([
      'scripts/__tests__/docs-budget.test.ts', 'client/services/llm/generation/__tests__/references.test.ts',
    ])
    expect(files(result.checks)).not.toContain('server/__tests__/workshop-timing-payment-session.test.ts')
  })

  it('keeps executable sandbox document behavior contracts and rejects a missing declared consumer', () => {
    expect(files(documentationVerification(['docs/CUSTOM_CARD_SANDBOX.md'], inventory).checks)).toContain('server/__tests__/workshop-composed-behaviors-session.test.ts')
    expect(() => documentationVerification(['docs/CUSTOM_CARD_SANDBOX.md'], { ...inventory, vitest: inventory.vitest.slice(0, 2) }))
      .toThrow('Declared documentation behavior consumer is missing')
  })

  it('runs a changed complete browser file without unrelated unit or browser suites', () => {
    const result = supportVerification(['e2e-tests/game-end.spec.ts'], inventory, evidence(), [{ status: 'M', path: 'e2e-tests/game-end.spec.ts' }])
    expect(result.checks).toEqual([{ kind: 'browser', browser: 'chromium', files: ['e2e-tests/game-end.spec.ts'], grep: null }])
    expect(result.expansionReasons).toEqual([])
  })

  it('retains the declared WebKit cases of a changed browser file', () => {
    const index = evidence()
    const target = index.tests.find(test => test.file === 'e2e-tests/replay-viewer-csp.spec.ts')
    if (!target) throw new Error('Missing fixture browser')
    target.literals.push('immutable replay @webkit')
    const result = supportVerification([target.file], inventory, index, [{ status: 'M', path: target.file }])
    expect(result.checks).toContainEqual({ kind: 'browser', browser: 'webkit', files: [target.file], grep: '@webkit' })
  })

  it('runs all helper consumers and uncertain browsers, without selecting backend tests', () => {
    const index = evidence()
    for (const test of index.tests) {
      if (/game-end|ws-dual/.test(test.file)) test.dependencies.push('e2e-tests/fixtures.ts')
      if (/replay-viewer/.test(test.file)) test.uncertaintyReasons.push('Computed import in browser helper')
    }
    const result = supportVerification(['e2e-tests/fixtures.ts'], inventory, index, [{ status: 'M', path: 'e2e-tests/fixtures.ts' }])
    expect(files(result.checks)).toEqual(inventory.browser.toSorted())
    expect(result.expansionReasons).toEqual([])
    expect(result.wideningReasons.length).toBeGreaterThan(0)
  })

  it('rejects stale or incomplete consumer evidence instead of silently omitting a new test', () => {
    const index = evidence()
    index.tests.pop()
    expect(() => assertConsumerCoverage(inventory, index)).toThrow('every discovered test exactly once')
    expect(() => assertConsumerCoverage({ ...inventory, browser: [] }, evidence())).toThrow('does not match')
  })

  it.each([
    { path: 'e2e-tests/old.spec.ts', status: 'D' as const },
    { path: 'e2e-tests/fixtures/browser-card-tests.html', status: 'M' as const },
  ])('bounds a missing static browser owner to its complete layer: $path', change => {
    const result = supportVerification([change.path], inventory, evidence(), [change])
    expect(files(result.checks)).toEqual(inventory.browser.toSorted())
    expect(result.expansionReasons).toEqual([])
    expect(result.wideningReasons.join(' ')).toContain('complete established test layer')
  })

  it('retains the prior browser layer when renaming a helper whose old imports disappeared', () => {
    const previousPath = 'e2e-tests/helpers/old.ts'
    const result = supportVerification([previousPath, 'e2e-tests/helpers/new.ts'], inventory, evidence(), [
      { status: 'R', previousPath, path: 'e2e-tests/helpers/new.ts' },
    ])
    expect(files(result.checks)).toEqual(inventory.browser.toSorted())
    expect(result.expansionReasons).toEqual([])
  })

  it('rejects duplicate or detached test evidence', () => {
    const duplicate = evidence()
    duplicate.tests.push(duplicate.tests[0])
    expect(() => assertConsumerCoverage(inventory, duplicate)).toThrow('exactly once')
    const detached = evidence()
    detached.tests[0].dependencies = []
    expect(() => assertConsumerCoverage(inventory, detached)).toThrow('source identity')
  })

  it('retains full fallback when a new helper has no established ownership or index parsing failed', () => {
    expect(supportVerification(['new-service/helper.ts'], inventory, evidence(), []).expansionReasons).toHaveLength(1)
    const failed = evidence()
    failed.expansionReasons.push('Cannot parse helper')
    expect(supportVerification(['e2e-tests/fixtures.ts'], inventory, failed, []).expansionReasons).toEqual(['Cannot parse helper'])
  })
})
