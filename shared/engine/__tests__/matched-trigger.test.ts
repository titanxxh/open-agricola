import { describe, it, expect } from 'vitest'
import { getPlayOrderIndex } from '../matched-trigger'
import type { PlayerState } from '../../contract/types'

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1', name: 'p1', color: 'red',
  resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
    grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
  workers: [], rooms: 2, houseType: 'wood',
  fields: [], fences: 0, roomTiles: [], stableTiles: [],
  improvements: [], minorHand: [], minorPlayed: [],
  occupationHand: [], occupationPlayed: [],
  houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
  pastures: [], fenceSegments: [],
  majorEffects: { wellRounds: 0 }, startPlayer: false,
  activeModifiers: [], cardStates: {},
  ...overrides,
} as PlayerState)

describe('getPlayOrderIndex', () => {
  it('occupation slot returns 0-based index', () => {
    const p = makePlayer({ occupationPlayed: ['A1', 'B2', 'C3'] })
    expect(getPlayOrderIndex(p, 'A1')).toBe(0)
    expect(getPlayOrderIndex(p, 'C3')).toBe(2)
  })

  it('minor improvement comes after all occupations', () => {
    const p = makePlayer({
      occupationPlayed: ['A1', 'B2'],
      minorPlayed: ['M1'],
    })
    expect(getPlayOrderIndex(p, 'M1')).toBe(2)
  })

  it('improvement (major) is sorted last', () => {
    const p = makePlayer({ improvements: ['Maj1'] })
    expect(getPlayOrderIndex(p, 'Maj1')).toBeGreaterThan(900)
  })

  it('unknown card id falls back to MAX_SAFE_INTEGER', () => {
    const p = makePlayer({})
    expect(getPlayOrderIndex(p, 'Unknown')).toBe(Number.MAX_SAFE_INTEGER)
  })
})
