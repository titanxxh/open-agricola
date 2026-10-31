import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readTestConsumerIndex } from '../ci/test-consumers'
import type { TestInventory } from '../ci/verification-plan'

const temporary: string[] = []
afterEach(() => temporary.splice(0).forEach(cwd => rmSync(cwd, { recursive: true, force: true })))
const write = (cwd: string, file: string, contents: string) => {
  mkdirSync(dirname(join(cwd, file)), { recursive: true })
  writeFileSync(join(cwd, file), contents)
}
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'test-consumers-'))
  temporary.push(cwd)
  const file = 'server/__tests__/payment.test.ts'
  const inventory: TestInventory = { vitest: [{ file, project: 'fast-server' }], browser: [] }
  return { cwd, file, inventory }
}

describe('test consumer evidence', () => {
  it('follows two helper levels and reexports but stops at each production edge', () => {
    const { cwd, file, inventory } = fixture()
    write(cwd, file, "import { pay } from './_helpers/payments'\npay('pay-cost')\n")
    write(cwd, 'server/__tests__/_helpers/payments.ts', "export { pay } from './nested/reexport'\n")
    write(cwd, 'server/__tests__/_helpers/nested/reexport.ts', "import { settlePayment } from '../../../game/payment'\nexport const pay = () => settlePayment('computeCosts')\n")
    write(cwd, 'server/game/payment.ts', "import './unrelated'\nexport const PRODUCTION_SENTINEL = 'never-consumer-evidence'\n")
    write(cwd, 'server/game/unrelated.ts', 'export const unrelated = true\n')

    const index = readTestConsumerIndex(cwd, inventory)

    expect(index.inventoryKey).toBe(JSON.stringify(inventory))
    expect(index.expansionReasons).toEqual([])
    expect(index.tests[0]?.dependencies).toEqual([
      'server/__tests__/_helpers/nested/reexport.ts', 'server/__tests__/_helpers/payments.ts', file, 'server/game/payment.ts',
    ])
    expect(index.tests[0]?.symbols).toContain('settlePayment')
    expect(index.tests[0]?.literals).toContain('computeCosts')
    expect(index.tests[0]?.literals).not.toContain('never-consumer-evidence')
    expect(index.tests[0]?.symbols).not.toContain('PRODUCTION_SENTINEL')
    expect(index.tests[0]?.uncertaintyReasons).toEqual([])
  })

  it('discovers renamed helpers and newly inventoried tests from current files', () => {
    const { cwd, file, inventory } = fixture()
    write(cwd, file, "import './_helpers/before'\n")
    write(cwd, 'server/__tests__/_helpers/before.ts', "export const action = 'pay'\n")
    const before = readTestConsumerIndex(cwd, inventory)
    renameSync(join(cwd, 'server/__tests__/_helpers/before.ts'), join(cwd, 'server/__tests__/_helpers/after.ts'))
    write(cwd, file, "import './_helpers/after'\n")
    const added = 'e2e-tests/new-payment.spec.ts'
    inventory.browser.push(added)
    write(cwd, added, "import { action } from '../server/__tests__/_helpers/after'\nconsume(action)\n")

    const after = readTestConsumerIndex(cwd, inventory)

    expect(after.inventoryKey).not.toBe(before.inventoryKey)
    expect(after.expansionReasons).toEqual([])
    expect(after.tests.map(test => test.file)).toEqual([file, added])
    for (const consumer of after.tests) {
      expect(consumer.dependencies).toContain('server/__tests__/_helpers/after.ts')
      expect(consumer.dependencies).not.toContain('server/__tests__/_helpers/before.ts')
      expect(consumer.literals).toContain('pay')
    }
  })

  it('resolves literal dynamic imports and requires, and terminates helper cycles', () => {
    const { cwd, file, inventory } = fixture()
    write(cwd, file, "await import(`./_helpers/a`)\nconst fixture = require('./_helpers/b')\n")
    write(cwd, 'server/__tests__/_helpers/a.ts', "export * from './b'\nexport const hook = 'animalCapacity'\n")
    write(cwd, 'server/__tests__/_helpers/b.ts', "import './a'\nexport const hook = 'computeBonusScore'\n")

    const index = readTestConsumerIndex(cwd, inventory)

    expect(index.expansionReasons).toEqual([])
    expect(index.tests[0]?.dependencies).toEqual(['server/__tests__/_helpers/a.ts', 'server/__tests__/_helpers/b.ts', file])
    expect(index.tests[0]?.literals).toEqual(expect.arrayContaining(['animalCapacity', 'computeBonusScore']))
    expect(index.tests[0]?.uncertaintyReasons).toEqual([])
  })

  it('propagates computed, unresolved and filesystem fixture uncertainty to each consumer', () => {
    const { cwd, file, inventory } = fixture()
    write(cwd, file, "import './_helpers/dynamic'\n")
    write(cwd, 'server/__tests__/_helpers/dynamic.ts', "import { readFileSync } from 'node:fs'\nawait import(inputPath)\nrequire(prefix + name)\nimport './missing'\nreadFileSync(fixturePath)\nimport.meta.glob('./cards/*.ts')\n")

    const index = readTestConsumerIndex(cwd, inventory)

    expect(index.expansionReasons).toEqual([])
    expect(index.tests[0]?.uncertaintyReasons).toEqual([
      'Computed module consumer: server/__tests__/_helpers/dynamic.ts',
      'Computed module or fixture consumer: server/__tests__/_helpers/dynamic.ts',
      'Filesystem or glob consumer: server/__tests__/_helpers/dynamic.ts',
      'Unresolved module consumer in server/__tests__/_helpers/dynamic.ts: ./missing',
    ])
  })

  it('records JSON fixture dependencies without claiming their dynamic values were inspected', () => {
    const { cwd, file, inventory } = fixture()
    write(cwd, file, "import data from './fixtures/cards.json'\nconsume(data)\n")
    write(cwd, 'server/__tests__/fixtures/cards.json', '{"hook":"computeCosts"}')

    const index = readTestConsumerIndex(cwd, inventory)

    expect(index.expansionReasons).toEqual([])
    expect(index.tests[0]?.dependencies).toContain('server/__tests__/fixtures/cards.json')
    expect(index.tests[0]?.literals).not.toContain('computeCosts')
    expect(index.tests[0]?.uncertaintyReasons).toEqual(['Non-source fixture consumer in server/__tests__/payment.test.ts: server/__tests__/fixtures/cards.json'])
  })

  it('keeps aliased filesystem reads and unknown module loaders explicitly uncertain', () => {
    const { cwd, file, inventory } = fixture()
    write(cwd, file, "import { readFileSync as read } from 'node:fs'\nimport { createRequire } from 'node:module'\nimport 'unresolved-package-alias'\nconst load = require\nconst customLoad = createRequire(import.meta.url)\nread(inputPath)\nload(inputPath)\ncustomLoad(inputPath)\n")

    const index = readTestConsumerIndex(cwd, inventory)

    expect(index.expansionReasons).toEqual([])
    expect(index.tests[0]?.uncertaintyReasons).toEqual([
      `Filesystem or glob consumer: ${file}`,
      `Indirect module consumer: ${file}`,
      `Unknown module loader consumer: ${file}`,
      `Unresolved module consumer in ${file}: unresolved-package-alias`,
    ])
  })

  it('reports missing inventoried files and malformed shared helpers as expansion failures', () => {
    const { cwd, file, inventory } = fixture()
    const other = 'server/__tests__/other.test.ts'
    const missing = 'e2e-tests/missing.spec.ts'
    inventory.vitest.push({ file: other, project: 'fast-server' })
    inventory.browser.push(missing)
    write(cwd, file, "import './_helpers/broken'\n")
    write(cwd, other, "import './_helpers/broken'\n")
    write(cwd, 'server/__tests__/_helpers/broken.ts', 'export const broken = (\n')

    const index = readTestConsumerIndex(cwd, inventory)

    expect(index.tests.map(test => test.file)).toEqual([file, other, missing])
    expect(index.expansionReasons).toHaveLength(2)
    expect(index.expansionReasons).toEqual(expect.arrayContaining([
      expect.stringContaining('Cannot inspect test consumer evidence server/__tests__/_helpers/broken.ts:'),
      expect.stringContaining('Cannot inspect test consumer evidence e2e-tests/missing.spec.ts:'),
    ]))
    for (const consumer of index.tests) expect(consumer.symbols).not.toContain('broken')
  })
})
