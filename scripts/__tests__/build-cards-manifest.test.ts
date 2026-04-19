import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { buildCardsManifest } from '../build-cards-manifest'

const fixturesRoot = path.resolve(__dirname, 'fixtures/cards')

describe('buildCardsManifest', () => {
  it('extracts meta from a single Occupation card', () => {
    const manifest = buildCardsManifest(fixturesRoot)
    expect(manifest['A999_TestCard']).toBeDefined()
    expect(manifest['A999_TestCard'].meta).toEqual({
      id: 'A999_TestCard',
      name: 'Test Card',
      deck: 'A',
      number: 999,
      category: 'FOOD_PROVIDER',
      desc: ['A test card for unit tests.'],
      cost: {},
      players: '1+',
    })
    expect(manifest['A999_TestCard'].reaches).toEqual([])
    expect(manifest['A999_TestCard'].module).toMatch(/A\/A999_TestCard$/)
  })

  it('extracts meta from a MajorImprovement card', () => {
    const manifest = buildCardsManifest(fixturesRoot)
    expect(manifest['MA_Test']).toBeDefined()
    expect(manifest['MA_Test'].meta.deck).toBe('major')
    expect(manifest['MA_Test'].meta.cost).toEqual({ wood: 2, clay: 1 })
  })

  it('defaults reaches to empty array for all cards', () => {
    const manifest = buildCardsManifest(fixturesRoot)
    for (const id of Object.keys(manifest)) {
      expect(manifest[id].reaches).toEqual([])
    }
  })
})
