import { describe, expect, it } from 'vitest'
import type { PlayerState } from '../../../contract/types'
import { cardCountsAs, collectCardsAs, playerHasCardCapability } from '../card-type'

import '../../major'
import '../../D/D060_LargePottery'
import '../../D/D059_EarthOven'
import '../../D/D025_WitchesDanceFloor'
import '../../A/A060_OrientalFireplace'
import '../../C/C060_SmallPottersOven'
import '../../B/B068_Beanfield'
import '../../C/C035_LanternHouse'

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
    expect(cardCountsAs('B068_Beanfield', 'major')).toBe(false)
    expect(cardCountsAs('B068_Beanfield', 'minor')).toBe(true)
  })

  it('D60 LargePottery (minor with alsoCountsAs major) counts as both', () => {
    expect(cardCountsAs('D060_LargePottery', 'minor')).toBe(true)
    expect(cardCountsAs('D060_LargePottery', 'major')).toBe(true)
  })

  it('D59 EarthOven counts as major via alsoCountsAs', () => {
    expect(cardCountsAs('D059_EarthOven', 'major')).toBe(true)
    expect(cardCountsAs('D059_EarthOven', 'minor')).toBe(true)
  })

  it('A60 OrientalFireplace counts as major via alsoCountsAs', () => {
    expect(cardCountsAs('A060_OrientalFireplace', 'major')).toBe(true)
    expect(cardCountsAs('A060_OrientalFireplace', 'minor')).toBe(true)
  })

  it('D25 WitchesDanceFloor counts as major via alsoCountsAs', () => {
    expect(cardCountsAs('D025_WitchesDanceFloor', 'major')).toBe(true)
    expect(cardCountsAs('D025_WitchesDanceFloor', 'minor')).toBe(true)
  })

  it('C60 SmallPottersOven counts as major via alsoCountsAs', () => {
    expect(cardCountsAs('C060_SmallPottersOven', 'major')).toBe(true)
    expect(cardCountsAs('C060_SmallPottersOven', 'minor')).toBe(true)
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
      minorPlayed: ['D060_LargePottery', 'B068_Beanfield'],
    })
    const result = collectCardsAs(p, 'major')
    expect(new Set(result)).toEqual(new Set(['Major_Pottery', 'D060_LargePottery']))
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
      minorPlayed: ['D060_LargePottery', 'B068_Beanfield'],
    })
    expect(new Set(collectCardsAs(p, 'minor'))).toEqual(
      new Set(['D060_LargePottery', 'B068_Beanfield']),
    )
  })
})

describe('playerHasCardCapability', () => {
  it('only reads played cards when checking hand-discard prevention', () => {
    const inHand = makePlayer({
      minorHand: ['C035_LanternHouse'],
    })
    expect(playerHasCardCapability(inHand, 'preventsHandDiscard')).toBe(false)

    const played = makePlayer({
      minorPlayed: ['C035_LanternHouse'],
    })
    expect(playerHasCardCapability(played, 'preventsHandDiscard')).toBe(true)
  })

  it('uses counts-as semantics when filtering by card type', () => {
    const player = makePlayer({
      minorPlayed: ['D025_WitchesDanceFloor'],
    })

    expect(playerHasCardCapability(player, 'fireplaceIdentity', { asType: 'major' })).toBe(true)
    expect(playerHasCardCapability(player, 'fireplaceIdentity', { asType: 'occupation' })).toBe(false)
  })
})
