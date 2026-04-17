import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState } from '../../game/types'

import '../D/D29_MuckRake'
import '../D/D31_Storeroom'
import '../D/D35_FodderChamber'
import { D60_LargePottery } from '../D/D60_LargePottery'
import '../B/B153_Housemaster'
import '../major/fireplace'
import '../major/cooking-hearth'
import '../major/clay-oven'
import '../major/joinery'
import '../major/pottery'
import '../major/stone-oven'
import '../major/basketmaker'
import '../major/well'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [], playedCards: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    newbornCount: 0, pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as unknown as PlayerState

const createState = (playerCount: number, ...players: PlayerState[]): GameState => {
  const ps = players.length ? players : [createPlayer('p1')]
  while (ps.length < playerCount) ps.push(createPlayer(`p${ps.length + 1}`))
  return ({
    round: 3, phase: 'work', currentPlayerIndex: 0, players: ps,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState
}

// ===== D29 Muck Rake =====
describe('D29_MuckRake', () => {
  const effect = () => getCardEffect('D29_MuckRake')!
  it('returns 0 with no animals in unfenced stables', () => {
    const p = createPlayer()
    p.minorPlayed = ['D29_MuckRake']
    expect(effect().computeBonusScore!(createState(2, p), p)).toBe(0)
  })
  it('returns 1 with sheep in an unfenced stable', () => {
    const p = createPlayer()
    p.minorPlayed = ['D29_MuckRake']
    p.stableAnimals = { 'a1': 'sheep' }
    expect(effect().computeBonusScore!(createState(2, p), p)).toBe(1)
  })
  it('returns 3 with sheep, pig, cattle in separate unfenced stables', () => {
    const p = createPlayer()
    p.minorPlayed = ['D29_MuckRake']
    p.stableAnimals = { 'a1': 'sheep', 'a2': 'boar', 'a3': 'cattle' }
    expect(effect().computeBonusScore!(createState(2, p), p)).toBe(3)
  })
  it('returns 1 even with two sheep stables (each type max once)', () => {
    const p = createPlayer()
    p.minorPlayed = ['D29_MuckRake']
    p.stableAnimals = { 'a1': 'sheep', 'a2': 'sheep' }
    expect(effect().computeBonusScore!(createState(2, p), p)).toBe(1)
  })
})

// ===== D31 Storeroom =====
describe('D31_Storeroom', () => {
  const effect = () => getCardEffect('D31_Storeroom')!
  it('counts supply + field crops, ceil(pairs/2)', () => {
    const p = createPlayer()
    p.minorPlayed = ['D31_Storeroom']
    p.resources.grain = 2
    p.resources.vegetable = 1
    p.fields = [
      { crop: 'grain', remaining: 1, row: 0, col: 0 },
      { crop: 'vegetable', remaining: 2, row: 0, col: 1 },
    ] as any
    expect(effect().computeBonusScore!(createState(2, p), p)).toBe(2)
  })
  it('4 pairs → 2 points', () => {
    const p = createPlayer()
    p.minorPlayed = ['D31_Storeroom']
    p.resources.grain = 4
    p.resources.vegetable = 4
    expect(effect().computeBonusScore!(createState(2, p), p)).toBe(2)
  })
  it('1 pair → 1 point (ceil 0.5)', () => {
    const p = createPlayer()
    p.minorPlayed = ['D31_Storeroom']
    p.resources.grain = 1
    p.resources.vegetable = 1
    expect(effect().computeBonusScore!(createState(2, p), p)).toBe(1)
  })
  it('no veg → 0', () => {
    const p = createPlayer()
    p.minorPlayed = ['D31_Storeroom']
    p.resources.grain = 5
    expect(effect().computeBonusScore!(createState(2, p), p)).toBe(0)
  })
})

// ===== D35 Fodder Chamber =====
describe('D35_FodderChamber player-count divisors', () => {
  const effect = () => getCardEffect('D35_FodderChamber')!
  const tryWith = (playerCount: number, animals: number) => {
    const p = createPlayer()
    p.minorPlayed = ['D35_FodderChamber']
    p.resources.sheep = animals
    return effect().computeBonusScore!(createState(playerCount, p), p)
  }
  it('1-player: div 7', () => {
    expect(tryWith(1, 6)).toBe(0)
    expect(tryWith(1, 7)).toBe(1)
    expect(tryWith(1, 14)).toBe(2)
  })
  it('2-player: div 5', () => {
    expect(tryWith(2, 4)).toBe(0)
    expect(tryWith(2, 5)).toBe(1)
    expect(tryWith(2, 10)).toBe(2)
  })
  it('3-player: div 4', () => {
    expect(tryWith(3, 3)).toBe(0)
    expect(tryWith(3, 4)).toBe(1)
    expect(tryWith(3, 12)).toBe(3)
  })
  it('4-player: div 3', () => {
    expect(tryWith(4, 2)).toBe(0)
    expect(tryWith(4, 3)).toBe(1)
    expect(tryWith(4, 9)).toBe(3)
  })
})

// ===== D60 Large Pottery exchange =====
describe('D60_LargePottery', () => {
  it('exposes the anytime clay→2 food exchange', () => {
    expect((D60_LargePottery as any).exchanges).toEqual([
      { from: { clay: 1 }, to: { food: 2 }, trigger: 'anytime' },
    ])
  })
})

// ===== B153 Housemaster =====
describe('B153_Housemaster sum + smallest doubled', () => {
  const effect = () => getCardEffect('B153_Housemaster')!
  it('no majors → 0', () => {
    const p = createPlayer()
    p.occupationPlayed = ['B153_Housemaster']
    expect(effect().computeBonusScore!(createState(2, p), p)).toBe(0)
  })
  it('Fireplace(1) + CookingHearth(1) + ClayOven(2) totals 5 → bonus 1', () => {
    const p = createPlayer()
    p.occupationPlayed = ['B153_Housemaster']
    p.improvements = ['Major_Fireplace1', 'Major_CookingHearth1', 'Major_ClayOven']
    expect(effect().computeBonusScore!(createState(2, p), p)).toBe(1)
  })
  it('Well(4) + StoneOven(3) + Joinery(2) totals 11 → bonus 4', () => {
    const p = createPlayer()
    p.occupationPlayed = ['B153_Housemaster']
    p.improvements = ['Major_Well', 'Major_StoneOven', 'Major_Joinery']
    expect(effect().computeBonusScore!(createState(2, p), p)).toBe(4)
  })
  it('Joinery(2) + Pottery(2) totals 6 → bonus 1', () => {
    const p = createPlayer()
    p.occupationPlayed = ['B153_Housemaster']
    p.improvements = ['Major_Joinery', 'Major_Pottery']
    expect(effect().computeBonusScore!(createState(2, p), p)).toBe(1)
  })
  it('A60 Oriental adds +1 when smallest major is 1VP', () => {
    const p = createPlayer()
    p.occupationPlayed = ['B153_Housemaster']
    p.improvements = ['Major_CookingHearth1', 'Major_Joinery']
    p.minorPlayed = ['A60_OrientalFireplace']
    expect(effect().computeBonusScore!(createState(2, p), p)).toBe(1)
  })
  it('A60 does NOT add when smallest major ≥ 2VP', () => {
    const p = createPlayer()
    p.occupationPlayed = ['B153_Housemaster']
    p.improvements = ['Major_Joinery', 'Major_Pottery']
    p.minorPlayed = ['A60_OrientalFireplace']
    expect(effect().computeBonusScore!(createState(2, p), p)).toBe(1)
  })
})
