import { describe, expect, it } from 'vitest'
import { ENCYCLOPEDIA_GROUPS } from '../../shared/contract/card-encyclopedia'
import { buildEncyclopediaEntries, projectPlayers } from '../card-encyclopedia/catalog'
import { loadEncyclopediaSources } from '../card-encyclopedia/sources'

const entries = buildEncyclopediaEntries(loadEncyclopediaSources())
const byKey = new Map(entries.map((entry) => [entry.key, entry]))
const entry = (key: string) => {
  const found = byKey.get(key)
  if (!found) throw new Error(`missing ${key}`)
  return found
}

describe('card encyclopedia printed costs', () => {
  it('keeps both printed payment paths of a card that offers alternatives', () => {
    expect(entry('card:A004_Baseboards').cost).toEqual({ kind: 'printed', paths: [{ food: 2 }, { grain: 1 }] })
  })

  it('flags the return-a-fireplace upgrade separately from the clay payment', () => {
    expect(entry('major:Major_CookingHearth1').cost).toEqual({
      kind: 'printed',
      paths: [{ clay: 4 }],
      returnCards: ['Major_Fireplace1', 'Major_Fireplace2', 'Major_Fireplace3'],
    })
    expect(entry('card:D059_EarthOven').cost).toMatchObject({ returnCards: ['Major_Fireplace1', 'Major_Fireplace2'] })
  })

  it('keeps same-named majors as separate entities with their own costs', () => {
    expect(['Major_Fireplace1', 'Major_Fireplace2', 'Major_Fireplace3'].map((id) => {
      const { group, displayNumber, cost } = entry(`major:${id}`)
      return { group, displayNumber, cost }
    })).toEqual([
      { group: 'majorStandard', displayNumber: null, cost: { kind: 'printed', paths: [{ clay: 2 }] } },
      { group: 'majorStandard', displayNumber: null, cost: { kind: 'printed', paths: [{ clay: 3 }] } },
      { group: 'major56', displayNumber: null, cost: { kind: 'printed', paths: [{ clay: 4 }] } },
    ])
  })

  it('distinguishes cards printing no resource cost from material that is never bought', () => {
    expect(entry('card:A085_Homekeeper').cost).toEqual({ kind: 'unlisted' })
    expect(entry('card:A006_StorageBarn').cost).toEqual({ kind: 'unlisted' })
    for (const key of ['parent:PR01', 'parent:PS01', 'moorStart:moor-start-1', 'season:winter', 'moorSpecialAction:moor-special-1-5-6-market-work']) {
      expect(entry(key).cost).toEqual({ kind: 'notApplicable' })
    }
  })
})

describe('card encyclopedia scores', () => {
  it('keeps a fixed score and the bonus marker side by side', () => {
    expect(entry('major:Major_Joinery').score).toEqual({ fixed: 2, extraVp: true })
    expect(entry('card:A039_Chapel').score).toEqual({ fixed: 3, extraVp: true })
  })

  it('reads negative and fractional fixed scores and never folds an unprinted score into zero', () => {
    expect(entry('parent:PR01').score).toEqual({ fixed: -0.75, extraVp: false })
    expect(entry('card:B033_Mantlepiece').score).toEqual({ fixed: -3, extraVp: true })
    expect(entry('card:A025_Bassinet').score).toEqual({ fixed: 0, extraVp: false })
    expect(entry('card:A004_Baseboards').score).toEqual({ fixed: null, extraVp: false })
    expect(entry('parent:PS01').score).toEqual({ fixed: null, extraVp: false })
    expect(entry('season:summer').score).toEqual({ fixed: null, extraVp: false })
  })
})

describe('card encyclopedia identity facts', () => {
  it('shows Farmers of the Moor majors by their M deck number', () => {
    expect(entry('major:Major_Moor_HorseSlaughterhouse1')).toMatchObject({ group: 'majorMoor', displayNumber: 'M001', publicType: 'major' })
    expect(entry('major:Major_Moor_VillageChurch')).toMatchObject({ group: 'majorMoor', displayNumber: 'M005' })
  })

  it('keeps the printed player-count condition', () => {
    expect(entry('card:D143_TreeCutter').players).toEqual({ minimum: 3 })
    expect(entry('card:A162_ForestTallyman').players).toEqual({ minimum: 4 })
    expect(entry('moorSpecialAction:moor-special-1-5-6-market-work').players).toEqual({ counts: [1, 5, 6] })
    for (const key of ['card:A004_Baseboards', 'major:Major_Joinery', 'parent:PR01', 'moorStart:moor-start-1', 'season:winter']) {
      expect(entry(key).players, key).toBeNull()
    }
  })

  it('refuses a player-count condition it cannot print', () => {
    expect(() => projectPlayers({ id: 'X001_Odd', players: '2-3' })).toThrow('X001_Odd')
  })

  it('files internal player-action cards under their public card type', () => {
    expect(entry('card:A039_Chapel')).toMatchObject({ publicType: 'minor', face: { kind: 'card', cardType: 'minor' } })
    expect(entry('card:A162_ForestTallyman')).toMatchObject({ publicType: 'occupation', face: { kind: 'card', cardType: 'occupation' } })
  })

  it('describes parent, moor and season material with its own face reference', () => {
    expect(entry('parent:PR01')).toMatchObject({ group: 'parents', publicType: 'mother', displayNumber: 'PR01' })
    expect(entry('parent:PS01')).toMatchObject({ publicType: 'father', displayNumber: 'PS01' })
    expect(entry('season:winter').face).toEqual({ kind: 'season', season: 'winter', actionId: 'season-winter-romantic-evening' })
    expect(entry('moorSpecialAction:moor-special-1-5-6-market-work').face).toEqual({
      kind: 'moorSpecialAction',
      image: expect.stringMatching(/\.(png|jpg|webp)$/),
      actions: ['black-market', 'illicit-work'],
    })
  })

  it('orders the catalog by declared group, then display number, then source id', () => {
    expect([...new Set(entries.map((item) => item.group))]).toEqual([
      'A', 'B', 'C', 'D', 'E', 'M', 'majorStandard', 'major56', 'majorMoor', 'parents', 'moor', 'seasons',
    ])
    expect(ENCYCLOPEDIA_GROUPS).toEqual([...new Set(entries.map((item) => item.group))])
    expect(entries.slice(0, 2).map((item) => item.key)).toEqual(['card:A001_Shelter', 'card:A002_ShiftingCultivation'])
    expect(entries.filter((item) => item.group === 'M').slice(0, 2).map((item) => item.displayNumber)).toEqual(['M015', 'M016'])
    expect(entries.filter((item) => item.group === 'majorMoor').map((item) => item.displayNumber)).toEqual([
      'M001', 'M002', 'M003', 'M004', 'M005', 'M006', 'M007', 'M008', 'M009', 'M010', 'M011', 'M012', 'M013', 'M014',
    ])
    expect(entries.filter((item) => item.group === 'majorStandard').map((item) => item.sourceId).slice(0, 3))
      .toEqual(['Major_Basket', 'Major_ClayOven', 'Major_CookingHearth1'])
    expect(entries.filter((item) => item.group === 'seasons').map((item) => item.sourceId)).toEqual(['autumn', 'spring', 'summer', 'winter'])
  })
})
