import { describe, expect, it } from 'vitest'
import type { PlayerState } from '../../../game/types'
import { cardCountsAs, collectCardsAs } from '../card-type'

import '../../major'
import '../../D/D60_LargePottery'
import '../../D/D59_EarthOven'
import '../../A/A60_OrientalFireplace'
import '../../B/B68_Beanfield'

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState =>
  ({
    id: 'p1', name: 'P1', color: 'red',
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
    ...overrides,
  }) as unknown as PlayerState

describe('cardCountsAs', () => {
  it('native major counts as major', () => {
    expect(cardCountsAs('Major_Pottery', 'major')).toBe(true)
  })

  it('native minor without alsoCountsAs does not count as major', () => {
    expect(cardCountsAs('B68_Beanfield', 'major')).toBe(false)
    expect(cardCountsAs('B68_Beanfield', 'minor')).toBe(true)
  })

  it('D60 LargePottery (minor with alsoCountsAs major) counts as both', () => {
    expect(cardCountsAs('D60_LargePottery', 'minor')).toBe(true)
    expect(cardCountsAs('D60_LargePottery', 'major')).toBe(true)
  })

  it('D59 EarthOven counts as major via alsoCountsAs', () => {
    expect(cardCountsAs('D59_EarthOven', 'major')).toBe(true)
    expect(cardCountsAs('D59_EarthOven', 'minor')).toBe(true)
  })

  it('A60 OrientalFireplace counts as major via alsoCountsAs', () => {
    expect(cardCountsAs('A60_OrientalFireplace', 'major')).toBe(true)
    expect(cardCountsAs('A60_OrientalFireplace', 'minor')).toBe(true)
  })

  it('unknown id counts as nothing', () => {
    expect(cardCountsAs('__UNKNOWN__', 'major')).toBe(false)
    expect(cardCountsAs('__UNKNOWN__', 'minor')).toBe(false)
  })
})

describe('collectCardsAs', () => {
  it('returns native major + dual-type minors under "major"', () => {
    const p = makePlayer({
      improvements: ['Major_Pottery'],
      minorPlayed: ['D60_LargePottery', 'B68_Beanfield'],
    })
    const result = collectCardsAs(p, 'major')
    expect(new Set(result)).toEqual(new Set(['Major_Pottery', 'D60_LargePottery']))
  })

  it('dedupes if same id appears twice (defensive)', () => {
    const p = makePlayer({
      improvements: ['Major_Pottery', 'Major_Pottery'],
      minorPlayed: [],
    })
    expect(collectCardsAs(p, 'major')).toEqual(['Major_Pottery'])
  })

  it('returns all minors under "minor" (dual-type stays in too)', () => {
    const p = makePlayer({
      improvements: ['Major_Pottery'],
      minorPlayed: ['D60_LargePottery', 'B68_Beanfield'],
    })
    expect(new Set(collectCardsAs(p, 'minor'))).toEqual(
      new Set(['D60_LargePottery', 'B68_Beanfield']),
    )
  })
})
