import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildRegisterAll } from '../generate-register-all'

describe('generate-register-all Card Source', () => {
  it('discovers classic deck directories without adding them to the ordinary deal catalog', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'classic-register-all-'))
    const cardsRoot = path.join(tmp, 'shared', 'cards')
    try {
      for (const deck of ['CE', 'CI', 'CWM', 'CC']) {
        const dir = path.join(cardsRoot, 'classic', deck)
        fs.mkdirSync(dir, { recursive: true })
        const id = `${deck}001_Source`
        fs.writeFileSync(path.join(dir, `${id}.ts`),
          `export const ${id} = defineMinorCard({
            meta: { id: '${id}', name: 'Source', deck: '${deck}', number: 1, desc: [], cost: {} },
            impl: { effect: { id: '${id}' } },
          })\n`)
        // Test files and non-directories must not become runtime card sources.
        fs.writeFileSync(path.join(dir, `${deck}.test.ts`),
          `export const IgnoredTest = defineMinorCard({ impl: {} })`)
      }
      fs.writeFileSync(path.join(cardsRoot, 'classic', 'README.md'), 'Classic cards')
      const result = buildRegisterAll({ repoRoot: tmp })
      for (const deck of ['CE', 'CI', 'CWM', 'CC']) {
        const id = `${deck}001_Source`
        expect(result.registerAll).toContain(`import { ${id} } from './classic/${deck}/${id}'`)
        expect(result.registerAll).toContain(`'${id}': ${id}.impl`)
        expect(result.catalogGenerated).not.toContain(id)
      }
      expect(result.implCount).toBe(4)
      expect(result.catalogDefinitionCount).toBe(0)
      expect(result.registerAll).not.toContain('IgnoredTest')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('includes only Card Source impl exports in ALL_CARD_IMPLS', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'card-source-register-all-'))
    const cardsRoot = path.join(tmp, 'shared', 'cards')
    fs.mkdirSync(path.join(cardsRoot, 'A'), { recursive: true })
    fs.mkdirSync(path.join(cardsRoot, 'B'), { recursive: true })
    fs.mkdirSync(path.join(tmp, 'shared', 'cards', 'community'), { recursive: true })
    fs.mkdirSync(path.join(cardsRoot, '__stubs__'), { recursive: true })

    fs.writeFileSync(
      path.join(cardsRoot, 'B', 'B001_Source.ts'),
      `import { defineOccupationCard } from '../card-source'\n` +
      `export const B001_Source = defineOccupationCard({\n` +
      `  meta: { id: 'B001_Source', name: 'Source', deck: 'B', number: 1, desc: [], players: '1+' },\n` +
      `  impl: { effect: { id: 'B001_Source' }, reaches: ['lessons'] },\n` +
      `})\n`,
      'utf8',
    )
    fs.writeFileSync(
      path.join(cardsRoot, 'B', 'B002_MetaOnly.ts'),
      `import { defineMinorCard } from '../card-source'\n` +
      `export const B002_MetaOnly = defineMinorCard({\n` +
      `  meta: { id: 'B002_MetaOnly', name: 'Meta Only', deck: 'B', number: 2, desc: [], cost: {} },\n` +
      `})\n`,
      'utf8',
    )
    fs.writeFileSync(
      path.join(cardsRoot, 'B', 'B003_ActionMinor.ts'),
      `import { definePlayerActionCard } from '../card-source'\n` +
      `export const B003_ActionMinor = definePlayerActionCard({\n` +
      `  meta: { id: 'B003_ActionMinor', name: 'Action Minor', deck: 'B', number: 3, playerActionCardType: 'minor', desc: [] },\n` +
      `})\n`,
      'utf8',
    )
    fs.writeFileSync(
      path.join(cardsRoot, 'B', 'B104_ActionOccupation.ts'),
      `import { definePlayerActionCard } from '../card-source'\n` +
      `export const B104_ActionOccupation = definePlayerActionCard({\n` +
      `  meta: { id: 'B104_ActionOccupation', name: 'Action Occupation', deck: 'B', number: 104, playerActionCardType: 'occupation', desc: [], players: '1+' },\n` +
      `})\n`,
      'utf8',
    )
    fs.writeFileSync(
      path.join(cardsRoot, '__stubs__', 'STUB_Source.ts'),
      `import { defineMinorCard } from '../card-source'\n` +
      `export const STUB_Source = defineMinorCard({\n` +
      `  meta: { id: 'STUB_Source', name: 'Stub', deck: '__stubs__', number: 1, desc: [], cost: {} },\n` +
      `  impl: { effect: { id: 'STUB_Source' }, reaches: ['test'] },\n` +
      `})\n`,
      'utf8',
    )

    const result = buildRegisterAll({ repoRoot: tmp })

    expect(result.registerAll).toContain(`import { B001_Source } from './B/B001_Source'`)
    expect(result.registerAll).toContain(`'B001_Source': B001_Source.impl`)
    expect(result.registerAll).toContain(`import { STUB_Source } from './__stubs__/STUB_Source'`)
    expect(result.registerAll).toContain(`'STUB_Source': STUB_Source.impl`)
    expect(result.registerAll).not.toContain('B002_MetaOnly')
    expect(result.catalogGenerated).toContain('export const catalogCardDefinitions')
    expect(result.catalogGenerated).toContain('"id": "B002_MetaOnly"')
    expect(result.catalogGenerated).toContain('"id": "B003_ActionMinor"')
    expect(result.catalogGenerated).toContain('"playerActionCardType": "occupation"')
    expect(result.catalogGenerated).toContain(`card.playerActionCardType === 'minor'`)
    expect(result.catalogGenerated).toContain(`card.playerActionCardType === 'occupation'`)
    expect(result.catalogGenerated).not.toContain('STUB_Source')

    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
