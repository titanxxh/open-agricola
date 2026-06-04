import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildRegisterAll } from '../generate-register-all'

describe('generate-register-all Card Source', () => {
  it('includes only Card Source impl exports in ALL_CARD_IMPLS', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'card-source-register-all-'))
    const cardsRoot = path.join(tmp, 'shared', 'cards')
    fs.mkdirSync(path.join(cardsRoot, 'A'), { recursive: true })
    fs.mkdirSync(path.join(cardsRoot, 'B'), { recursive: true })
    fs.mkdirSync(path.join(tmp, 'shared', 'cards', 'community'), { recursive: true })

    fs.writeFileSync(
      path.join(cardsRoot, 'B', 'B1_Source.ts'),
      `import { defineOccupationCard } from '../card-source'\n` +
      `export const B1_Source = defineOccupationCard({\n` +
      `  meta: { id: 'B1_Source', name: 'Source', deck: 'B', number: 1, desc: [], players: '1+' },\n` +
      `  impl: { effect: { id: 'B1_Source' }, reaches: ['lessons'] },\n` +
      `})\n`,
      'utf8',
    )
    fs.writeFileSync(
      path.join(cardsRoot, 'B', 'B2_MetaOnly.ts'),
      `import { defineMinorCard } from '../card-source'\n` +
      `export const B2_MetaOnly = defineMinorCard({\n` +
      `  meta: { id: 'B2_MetaOnly', name: 'Meta Only', deck: 'B', number: 2, desc: [], cost: {} },\n` +
      `})\n`,
      'utf8',
    )

    const result = buildRegisterAll({ repoRoot: tmp })

    expect(result.registerAll).toContain(`import { B1_Source } from './B/B1_Source'`)
    expect(result.registerAll).toContain(`'B1_Source': B1_Source.impl`)
    expect(result.registerAll).not.toContain('B2_MetaOnly')
    expect(result.catalogGenerated).toContain('export const catalogCardSources')
    expect(result.catalogGenerated).toContain('B2_MetaOnly')

    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
