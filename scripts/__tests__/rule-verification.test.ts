import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { readCardAssociationIndex } from '../ci/card-verification'
import { readRuleAssociationIndex, ruleSubsystemsForPath, ruleVerification } from '../ci/rule-verification'
import { readTestConsumerIndex } from '../ci/test-consumers'
import type { PlannedCheck, TestInventory } from '../ci/verification-plan'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const temporary: string[] = []
afterEach(() => temporary.splice(0).forEach(cwd => rmSync(cwd, { recursive: true, force: true })))
const write = (cwd: string, file: string, source: string) => {
  mkdirSync(dirname(join(cwd, file)), { recursive: true })
  writeFileSync(join(cwd, file), source)
}
const browserNames = [
  'choice-previews', 'rule-derived-action-preview', 'seasonal-fence-log', 'heating-exchange', 'listener-lifecycle-room',
  'room-animal-holders', 'animal-reorg-prefill', 'stage-animal-settlement', 'parrot-breeder',
  'crop-scoring', 'grain-distillery-scoring', 'source-aware-scoring', 'mobile-scoring-pad',
  'farm-select', 'farm-card-targets', 'apiary-sow-budget', 'farm-interaction-focus',
  'bga-preparation-order', 'seasonal-settlement-logs', 'moor-completion-window', 'standard-solo-acceptance',
  'card-localization', 'frontend-browser-scenario-matrix', 'unrelated-auth',
]
const cardSources = ['D/D011_LawnFertilizer', 'C/C016_FieldFences', 'C/C035_LanternHouse']
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'rule-verification-'))
  temporary.push(cwd)
  const inventory: TestInventory = {
    vitest: [
      { project: 'slow', file: 'server/__tests__/D011_LawnFertilizer-session.test.ts' },
      { project: 'slow', file: 'server/__tests__/C016_FieldFences-session.test.ts' },
      { project: 'slow', file: 'server/__tests__/C035_LanternHouse-session.test.ts' },
      { project: 'fast-server', file: 'server/__tests__/unhelpfully-named-session.test.ts' },
      { project: 'fast-server', file: 'server/__tests__/unrelated-auth.test.ts' },
      { project: 'fast-shared', file: 'shared/actions/payment/__tests__/brand-new.test.ts' },
      { project: 'fast-cards', file: 'shared/cards/__tests__/registry-audit.test.ts' },
      ...['fast-card-runtime', 'fast-client', 'fast-tests'].map(project => ({ project, file: `client/__tests__/${project}.test.ts` })),
    ],
    browser: browserNames.map(name => `e2e-tests/${name}.spec.ts`),
  }
  for (const source of cardSources) {
    const path = `shared/cards/${source}.ts`
    write(cwd, path, readFileSync(join(root, path), 'utf8'))
  }
  write(cwd, 'shared/cards/helpers/card-field.ts', readFileSync(join(root, 'shared/cards/helpers/card-field.ts'), 'utf8'))
  write(cwd, inventory.vitest[0]!.file, "const card = 'D011_LawnFertilizer'\n")
  write(cwd, inventory.vitest[1]!.file, "const card = 'C016_FieldFences'\n")
  write(cwd, inventory.vitest[2]!.file, "const card = 'C035_LanternHouse'\n")
  write(cwd, inventory.vitest[3]!.file, "import '../../shared/cards/D/D011_LawnFertilizer'\nconst cards = ['D011_LawnFertilizer', 'C035_LanternHouse']\n")
  write(cwd, inventory.vitest[4]!.file, 'const loggedIn = true\n')
  write(cwd, inventory.vitest[5]!.file, "import { PaymentSolver } from '../index'\nconst result = PaymentSolver\n")
  write(cwd, 'shared/actions/payment/index.ts', 'export const PaymentSolver = {}\n')
  write(cwd, inventory.vitest[6]!.file, 'const cards = Object.values(ALL_CARD_IMPLS)\n')
  for (const test of inventory.vitest.slice(7)) write(cwd, test.file, 'const unrelated = true\n')
  for (const file of inventory.browser) write(cwd, file, 'const rendered = true\n')
  const index = () => readRuleAssociationIndex(cwd, inventory,
    readCardAssociationIndex(cwd, inventory), readTestConsumerIndex(cwd, inventory))
  return { cwd, inventory, index }
}
const selectedFiles = (checks: PlannedCheck[]) => checks.flatMap(check => check.kind === 'catalog' ? [] : check.files)

describe('rule subsystem ownership', () => {
  it.each([
    ['shared/actions/payment/internal/future-solver.ts', ['payment']],
    ['shared/domain/animal-new-holder.ts', ['animals']],
    ['shared/domain/scoring-new-category.ts', ['scoring']],
    ['shared/domain/animal-payment.ts', ['payment', 'animals', 'round-variants']],
    ['shared/domain/room-construction.ts', ['animals', 'farm-crops']],
    ['shared/domain/field.ts', ['scoring', 'farm-crops', 'round-variants']],
    ['shared/actions/effects/exchange.ts', ['payment', 'animals', 'round-variants']],
    ['shared/seasons/new-season-rule.ts', ['round-variants']],
    ['shared/engine/engine.ts', ['core']],
    ['shared/session/phases/round.ts', ['core']],
    ['shared/cards/card-effects.ts', ['core']],
    ['shared/domain/new-unknown-rule.ts', ['core']],
    ['shared/unknown-new-module/new-rule.ts', []],
    ['operations/exporter.ts', []],
  ])('assigns %s to complete owned subsystems', (path, groups) => {
    expect(ruleSubsystemsForPath(path)).toEqual(groups)
  })
})

describe('rule consumer associations', () => {
  it('recognizes real modifier, listener and scoring mechanisms without relying on card names or PaymentSolver imports', () => {
    const value = fixture()
    const index = value.index()
    expect(index.expansionReasons).toEqual([])
    expect(index.cards.find(card => card.cardIds.includes('D011_LawnFertilizer'))?.subsystems).toContain('animals')
    expect(index.cards.find(card => card.cardIds.includes('C016_FieldFences'))?.subsystems).toEqual(expect.arrayContaining(['payment', 'farm-crops']))
    expect(index.cards.find(card => card.cardIds.includes('C035_LanternHouse'))?.subsystems).toEqual(['payment', 'scoring'])

    const animals = ruleVerification(['shared/domain/animal-zones.ts'], value.inventory, index)
    const files = selectedFiles(animals.checks)
    expect(animals.expansionReasons).toEqual([])
    expect(files).toContain('server/__tests__/D011_LawnFertilizer-session.test.ts')
    expect(files).toContain('server/__tests__/unhelpfully-named-session.test.ts')
    expect(files).toContain('shared/cards/__tests__/registry-audit.test.ts')
    expect(files).not.toContain('server/__tests__/C035_LanternHouse-session.test.ts')
    expect(files).not.toContain('server/__tests__/unrelated-auth.test.ts')
    expect(animals.checks).toContainEqual({ kind: 'browser', browser: 'webkit', files: ['e2e-tests/frontend-browser-scenario-matrix.spec.ts'], grep: '@webkit' })
  })

  it('unions mixed subsystems and discovers newly added tests from their production imports', () => {
    const value = fixture()
    const file = 'server/__tests__/brand-new-regression.test.ts'
    value.inventory.vitest.push({ file, project: 'fast-server' })
    write(value.cwd, file, "import { solver } from '../../shared/actions/payment/new-public-helper'\nconst result = solver\n")
    write(value.cwd, 'shared/actions/payment/new-public-helper.ts', 'export const solver = {}\n')
    const selected = ruleVerification(['shared/domain/animal-payment.ts', 'shared/domain/scoring.ts'], value.inventory, value.index())
    expect(selected.expansionReasons).toEqual([])
    expect(selected.wideningReasons).toHaveLength(1)
    expect(selectedFiles(selected.checks)).toEqual(expect.arrayContaining([
      file, 'shared/actions/payment/__tests__/brand-new.test.ts',
      'server/__tests__/D011_LawnFertilizer-session.test.ts', 'server/__tests__/C035_LanternHouse-session.test.ts',
    ]))
    expect(selectedFiles(selected.checks)).not.toContain('server/__tests__/unrelated-auth.test.ts')
  })

  it('follows helper evidence but does not traverse GameSession into every rule module', () => {
    const value = fixture()
    const file = 'server/__tests__/through-helper.test.ts'
    value.inventory.vitest.push({ file, project: 'fast-server' })
    write(value.cwd, file, "import { chosen } from './_helpers/example'\nconst result = chosen\n")
    write(value.cwd, 'server/__tests__/_helpers/example.ts', "import { GameSession } from '../../game/authoritative-session'\nexport const chosen = ['D011_LawnFertilizer', new GameSession().takeAction(0, 'forest')]\n")
    write(value.cwd, 'server/game/authoritative-session.ts', "import '../../shared/domain/scoring'\nexport const GameSession = {}\n")
    write(value.cwd, 'shared/domain/scoring.ts', 'export const computeScores = {}\n')
    const index = value.index()
    expect(index.expansionReasons).toEqual([])
    expect(index.tests.find(test => test.file === file)?.subsystems).toEqual(['animals', 'farm-crops'])
    expect(selectedFiles(ruleVerification(['shared/domain/animal-zones.ts'], value.inventory, index).checks)).toContain(file)
    expect(selectedFiles(ruleVerification(['shared/domain/scoring.ts'], value.inventory, index).checks)).not.toContain(file)
  })

  it('retains computed consumers and unknown shared rule mechanisms in the safety group', () => {
    const value = fixture()
    const file = 'server/__tests__/computed-regression.test.ts'
    value.inventory.vitest.push({ file, project: 'fast-server' })
    write(value.cwd, file, "import { GameSession } from '../game/authoritative-session'\nconst module = await import(inputPath)\nnew GameSession().takeAction(0, unknownAction)\n")
    write(value.cwd, 'server/game/authoritative-session.ts', 'export class GameSession {}\n')
    const source = 'shared/cards/D/D011_LawnFertilizer.ts'
    write(value.cwd, source, readFileSync(join(root, source), 'utf8').replace('computePastureCapacityModifiers', 'onFutureUnknownRule'))
    const index = value.index()
    expect(index.expansionReasons).toEqual([])
    expect(index.cards.find(card => card.file === source)?.subsystems).toContain('core')
    const files = selectedFiles(ruleVerification(['shared/domain/scoring.ts'], value.inventory, index).checks)
    expect(files).toContain(file)
    expect(files).toContain('server/__tests__/D011_LawnFertilizer-session.test.ts')
  })

  it('follows two helper and reexport levels to a payment mechanism and preserves mixed ownership', () => {
    const value = fixture()
    const card = 'shared/cards/D/D011_LawnFertilizer.ts'
    write(value.cwd, card, `${readFileSync(join(root, card), 'utf8')}\nimport { hidden } from '../helpers/payment-bridge'\nvoid hidden\n`)
    write(value.cwd, 'shared/cards/helpers/payment-bridge.ts', "export { hidden } from './second-bridge'\n")
    write(value.cwd, 'shared/cards/helpers/second-bridge.ts', "export { hidden } from './third-bridge'\n")
    write(value.cwd, 'shared/cards/helpers/third-bridge.ts', "export const hidden = { phases: ['computeCosts'], actions: ['pay'] }\n")
    const index = value.index()
    expect(index.expansionReasons).toEqual([])
    expect(index.cards.find(source => source.file === card)?.subsystems).toEqual(['payment', 'animals', 'farm-crops'])
    expect(selectedFiles(ruleVerification(['shared/actions/payment/solver.ts'], value.inventory, index).checks)).toContain('server/__tests__/D011_LawnFertilizer-session.test.ts')
  })

  it('does not treat broad card availability or a history output fixture as an unknown rule mechanism', () => {
    const value = fixture()
    const cards = readCardAssociationIndex(value.cwd, value.inventory)
    const scoring = cards.sources.find(source => source.cardIds.includes('C035_LanternHouse'))!
    scoring.broadFootprint = true
    const file = 'server/__tests__/history-only.test.ts'
    value.inventory.vitest.push({ file, project: 'fast-server' })
    write(value.cwd, file, "import { history } from '../../shared/session/history-streams'\nconst result = history\n")
    write(value.cwd, 'shared/session/history-streams.ts', 'export const history = {}\n')
    cards.inventoryKey = JSON.stringify(value.inventory)
    const index = readRuleAssociationIndex(value.cwd, value.inventory, cards, readTestConsumerIndex(value.cwd, value.inventory))
    expect(index.cards.find(card => card.file === scoring.file)?.subsystems).toEqual(['payment', 'scoring'])
    expect(index.tests.find(test => test.file === file)?.subsystems).toEqual([])
    expect(selectedFiles(ruleVerification(['shared/domain/animal-zones.ts'], value.inventory, index).checks)).not.toContain(file)
  })

  it('bridges real animal resource gains without attributing unused pay and scoring exports to gainLeaf', () => {
    const value = fixture()
    write(value.cwd, 'shared/cards/helpers/lessons-spaces.ts', readFileSync(join(root, 'shared/cards/helpers/lessons-spaces.ts'), 'utf8'))
    for (const id of ['A165_PigBreeder', 'A168_AnimalTeacher']) {
      const source = `shared/cards/A/${id}.ts`
      const file = `server/__tests__/${id}-session.test.ts`
      write(value.cwd, source, readFileSync(join(root, source), 'utf8'))
      write(value.cwd, file, `const card = '${id}'\n`)
      value.inventory.vitest.push({ file, project: 'slow' })
    }
    const index = value.index()
    expect(index.expansionReasons).toEqual([])
    const selected = selectedFiles(ruleVerification(['shared/domain/animals.ts'], value.inventory, index).checks)
    for (const id of ['A165_PigBreeder', 'A168_AnimalTeacher']) {
      expect(index.cards.find(card => card.cardIds.includes(id))?.subsystems).toContain('animals')
      expect(index.cards.find(card => card.cardIds.includes(id))?.subsystems).not.toContain('scoring')
      expect(index.cards.find(card => card.cardIds.includes(id))?.subsystems).not.toContain('core')
      expect(selected).toContain(`server/__tests__/${id}-session.test.ts`)
    }
    expect(ruleSubsystemsForPath('shared/cards/helpers/pay-gain-node.ts')).toEqual(['core'])
  })

  it.each(["import * as helpers from '../helpers/pay-gain-node'\nvoid helpers", "import { futureMechanism } from '../helpers/pay-gain-node'\nvoid futureMechanism"])(
    'keeps unknown public helper export consumption in the safety group: %s', (source) => {
      const value = fixture()
      const card = 'shared/cards/D/D011_LawnFertilizer.ts'
      write(value.cwd, card, `${readFileSync(join(root, card), 'utf8')}\n${source}\n`)
      expect(value.index().cards.find(item => item.file === card)?.subsystems).toContain('core')
    },
  )

  it('retains a mixed card with an unresolved helper mechanism and excludes unrelated filesystem consumers', () => {
    const value = fixture()
    const card = 'shared/cards/D/D011_LawnFertilizer.ts'
    write(value.cwd, card, `${readFileSync(join(root, card), 'utf8')}\nimport { hidden } from '../helpers/unknown'\nvoid hidden\n`)
    write(value.cwd, 'shared/cards/helpers/unknown.ts', 'export const hidden = externalRule\n')
    const operations = 'server/__tests__/unrelated-operations.test.ts'
    value.inventory.vitest.push({ file: operations, project: 'fast-server' })
    write(value.cwd, operations, "import { readFileSync } from 'node:fs'\nconst audit = readFileSync('snapshot.json')\n")
    const index = value.index()
    expect(index.cards.find(source => source.file === card)?.subsystems).toContain('core')
    expect(index.tests.find(test => test.file === operations)?.safetyReasons).toEqual([])
    const files = selectedFiles(ruleVerification(['shared/domain/scoring.ts'], value.inventory, index).checks)
    expect(files).toContain('server/__tests__/D011_LawnFertilizer-session.test.ts')
    expect(files).not.toContain(operations)
  })

  it('does not infer rule consumers from SQL card IDs or pure protocol vocabulary', () => {
    const value = fixture()
    for (const file of ['server/__tests__/sql-export.test.ts', 'shared/contract/__tests__/authoritative-command.test.ts']) {
      value.inventory.vitest.push({ file, project: file.startsWith('shared/') ? 'fast-shared' : 'fast-server' })
      write(value.cwd, file, "const database = { cardId: 'D011_LawnFertilizer', stables: [], action: 'pay', zones: [] }\n")
    }
    const index = value.index()
    expect(index.tests.find(test => test.file === 'server/__tests__/sql-export.test.ts')?.subsystems).toEqual([])
    expect(index.tests.find(test => test.file === 'shared/contract/__tests__/authoritative-command.test.ts')?.subsystems).toEqual([])
    expect(ruleVerification(['shared/unknown-new-module/new-rule.ts'], value.inventory, index).expansionReasons.join()).toContain('ownership is unknown')
  })

  it('keeps shared engine changes in complete rule groups without requesting repository full verification', () => {
    const value = fixture()
    const selected = ruleVerification(['shared/engine/engine-proceed.ts'], value.inventory, value.index())
    expect(selected.expansionReasons).toEqual([])
    expect(selected.wideningReasons).toEqual(['Shared rule core requires complete rule groups and browser consumers.'])
    expect(selectedFiles(selected.checks)).toContain('server/__tests__/unrelated-auth.test.ts')
    expect(selected.checks).toContainEqual({ kind: 'catalog', taskId: 'chromium-4' })
    expect(selected.checks).not.toContainEqual({ kind: 'catalog', taskId: 'fast' })
  })

  it('rejects missing, stale or incomplete rule and browser evidence', () => {
    const value = fixture()
    const index = value.index()
    expect(ruleVerification(['shared/domain/scoring.ts'], value.inventory, undefined).expansionReasons).not.toEqual([])
    expect(ruleVerification(['shared/domain/scoring.ts'], value.inventory, { ...index, inventoryKey: 'old' }).expansionReasons).not.toEqual([])
    expect(ruleVerification(['elsewhere/rules.ts'], value.inventory, index).expansionReasons).not.toEqual([])
    const inventory = { ...value.inventory, browser: value.inventory.browser.filter(file => file !== 'e2e-tests/crop-scoring.spec.ts') }
    const associations = readRuleAssociationIndex(value.cwd, inventory, readCardAssociationIndex(value.cwd, inventory), readTestConsumerIndex(value.cwd, inventory))
    expect(() => ruleVerification(['shared/domain/scoring.ts'], inventory, associations)).toThrow('crop-scoring')
    const incomplete = { ...value.inventory, vitest: value.inventory.vitest.filter(test => test.project !== 'fast-tests') }
    expect(() => ruleVerification(['shared/engine/engine.ts'], incomplete, { ...index, inventoryKey: JSON.stringify(incomplete) })).toThrow('fast-tests')
    const consumers = readTestConsumerIndex(value.cwd, value.inventory)
    consumers.tests.pop()
    expect(readRuleAssociationIndex(value.cwd, value.inventory, readCardAssociationIndex(value.cwd, value.inventory), consumers).expansionReasons.join()).toContain('missing, duplicated or stale')
  })
})
