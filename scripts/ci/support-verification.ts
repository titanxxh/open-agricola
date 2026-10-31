import type { TestConsumerIndex } from './test-consumers'
import type { ChangedPath, PlannedCheck, TestInventory } from './verification-plan'

type Mapping = { checks: PlannedCheck[]; expansionReasons: string[]; wideningReasons: string[] }
const referenceTest = 'client/services/llm/generation/__tests__/references.test.ts'
const documentationTest = 'scripts/__tests__/docs-budget.test.ts'
const sandboxDocuments = /^docs\/(?:CUSTOM_CARD_SANDBOX|community-card-examples)\.md$|^docs\/(?:prompts|examples)\//
export const isTestSupport = (file: string): boolean =>
  /(?:^|\/)(?:_helpers|helpers|fixtures|__fixtures__)(?:\/|\.)/.test(file)
    && /(?:__tests__|e2e-tests|^tests\/)/.test(file)
    || /(?:^|\/)setup(?:[-.][^/]*)?\.[cm]?[jt]sx?$/.test(file)

export function assertConsumerCoverage(inventory: TestInventory, associations: TestConsumerIndex): void {
  if (associations.expansionReasons.length) throw new Error(`Cannot establish test consumer evidence: ${associations.expansionReasons.join('; ')}`)
  if (associations.inventoryKey !== JSON.stringify(inventory)) throw new Error('Test consumer evidence does not match the discovered inventory')
  const expected = [...inventory.vitest.map(test => test.file), ...inventory.browser].sort()
  const actual = associations.tests.map(test => test.file).sort()
  if (new Set(actual).size !== actual.length || expected.length !== actual.length
    || expected.some((file, index) => file !== actual[index])) throw new Error('Test consumer evidence does not cover every discovered test exactly once')
  for (const test of associations.tests) {
    if (!test.dependencies.includes(test.file)) throw new Error(`Test consumer evidence lacks its source identity: ${test.file}`)
  }
}

function fileChecks(files: Set<string>, inventory: TestInventory, associations?: TestConsumerIndex): PlannedCheck[] {
  const checks: PlannedCheck[] = []
  for (const project of new Set(inventory.vitest.filter(test => files.has(test.file)).map(test => test.project))) {
    checks.push({ kind: 'vitest', project, files: inventory.vitest.filter(test => test.project === project && files.has(test.file)).map(test => test.file).sort() })
  }
  const browsers = inventory.browser.filter(file => files.has(file)).sort()
  if (browsers.length) {
    checks.push({ kind: 'browser', browser: 'chromium', files: browsers, grep: null })
    const webkit = browsers.filter(file => associations?.tests.find(test => test.file === file)?.literals.some(literal => /@webkit\b/.test(literal)))
    if (webkit.length) checks.push({ kind: 'browser', browser: 'webkit', files: webkit, grep: '@webkit' })
  }
  return checks
}

export function documentationVerification(paths: string[], inventory: TestInventory): Mapping {
  const selected = new Set([documentationTest])
  if (paths.some(path => !/_zh\.md$/.test(path)
    && /^docs\/(?:architecture\/|(?:CUSTOM_CARD_SANDBOX|CARD_TEST_TEMPLATE|ARCHITECTURE|card_implementation_status)\.md$)/.test(path))) selected.add(referenceTest)
  for (const file of selected) {
    if (!inventory.vitest.some(test => test.file === file)) throw new Error(`Declared documentation consumer is missing: ${file}`)
  }
  if (paths.some(path => sandboxDocuments.test(path))) {
    for (const file of ['server/__tests__/workshop-timing-payment-session.test.ts', 'server/__tests__/workshop-composed-behaviors-session.test.ts']) {
      if (!inventory.vitest.some(test => test.file === file)) throw new Error(`Declared documentation behavior consumer is missing: ${file}`)
      selected.add(file)
    }
  }
  return { checks: fileChecks(selected, inventory), expansionReasons: [], wideningReasons: [
    'Documentation selects its constraints, English reference readers, and explicit executable-contract consumers.',
  ] }
}

export function supportVerification(paths: string[], inventory: TestInventory, associations: TestConsumerIndex | undefined, changes: ChangedPath[]): Mapping {
  const full = (reason: string): Mapping => ({ checks: [], expansionReasons: [reason], wideningReasons: [] })
  if (!associations) return full('Test consumer evidence is missing; full verification is required.')
  assertConsumerCoverage(inventory, associations)
  const selected = new Set<string>()
  const wideningReasons: string[] = []
  for (const path of paths) {
    const browser = path.startsWith('e2e-tests/')
    const self = associations.tests.find(test => test.file === path)
    if (self) selected.add(path)
    const consumers = associations.tests.filter(test => test.dependencies.includes(path) || test.literals.includes(path))
    consumers.forEach(test => selected.add(test.file))
    const boundary = browser ? inventory.browser : inventory.vitest.filter(test => {
      if (path.startsWith('client/')) return test.project === 'fast-client'
      if (path.startsWith('server/')) return test.project === 'fast-server' || test.project === 'slow'
      if (path.startsWith('shared/cards/')) return test.project === 'fast-cards' || test.project === 'slow'
      if (path.startsWith('shared/')) return ['fast-shared', 'fast-card-runtime', 'fast-cards', 'fast-server', 'fast-tests', 'slow'].includes(test.project)
      return test.project === 'fast-scripts' || test.project === 'fast-tests'
    }).map(test => test.file)
    const removed = changes.some(change => change.status === 'D' && change.path === path
      || change.status === 'R' && change.previousPath === path)
    const establishedLayer = /^(?:e2e-tests|client|server|shared|scripts|tests)\//.test(path)
    if (!self && !consumers.length) {
      if (establishedLayer && (removed || isTestSupport(path))) {
        boundary.forEach(file => selected.add(file))
        wideningReasons.push(`${path} has no surviving static consumer; verification includes its complete established test layer.`)
        continue
      }
      return full(`No test consumers establish ownership for ${path}; full verification is required.`)
    }
    if (isTestSupport(path)) {
      const uncertain = associations.tests.filter(test => boundary.includes(test.file) && test.uncertaintyReasons.length)
      uncertain.forEach(test => selected.add(test.file))
      if (uncertain.length) wideningReasons.push(`${path} retains ${uncertain.length} uncertain consumers inside its established test layer.`)
      wideningReasons.push(`${path} selects all ${consumers.length} established test/helper consumers.`)
    }
    if (removed && !self) {
      boundary.forEach(file => selected.add(file))
      wideningReasons.push(`${path} was removed or renamed; verification includes its complete prior test layer.`)
    }
  }
  if (!selected.size) return full('No executable test consumers were established; full verification is required.')
  return { checks: fileChecks(selected, inventory, associations), expansionReasons: [], wideningReasons }
}
