import { describe, expect, it } from 'vitest'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseBgaCard } from '../bga-metadata/parse-bga'
import { parseTsCard } from '../bga-metadata/parse-ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = path.resolve(__dirname, 'fixtures')

describe('parseBgaCard', () => {
  it('extracts all literal fields from a full BGA card', () => {
    const phpPath = path.join(FIXTURE_DIR, 'bga/A99_Test.php')
    const card = parseBgaCard(phpPath)
    expect(card).toEqual({
      id: 'A99_Test',
      deck: 'A',
      number: 99,
      name: 'Test Card',
      category: 'POINTS_PROVIDER',
      players: '1+',
      extraVp: true,
      vp: 2,
      cost: { wood: 1, food: 2 },
      prerequisite: '5 Sheep on farm',
      banned: false,
    })
  })

  it('marks banned cards', () => {
    const phpPath = path.join(FIXTURE_DIR, 'bga/A14_Banned.php')
    const card = parseBgaCard(phpPath)
    expect(card.banned).toBe(true)
    expect(card.id).toBe('A14_Banned')
  })
})

describe('parseTsCard', () => {
  it('extracts fields from TS card-display file', () => {
    const tsPath = path.join(FIXTURE_DIR, 'ts/A99_Test.ts')
    const card = parseTsCard(tsPath)
    expect(card).toEqual({
      id: 'A99_Test',
      deck: 'A',
      number: 99,
      name: 'Test Card',
      category: 'POINTS_PROVIDER',
      players: '1+',
      vp: 1,
      cost: { wood: 1, food: 2 },
      prerequisite: 'Wooden House',
    })
  })

  it('handles cards with no optional fields', () => {
    const tsPath = path.join(FIXTURE_DIR, 'ts/A77_TsOnly.ts')
    const card = parseTsCard(tsPath)
    expect(card.id).toBe('A77_TsOnly')
    expect(card.players).toBe('1+')
    expect(card.extraVp).toBeUndefined()
    expect(card.vp).toBeUndefined()
  })
})
