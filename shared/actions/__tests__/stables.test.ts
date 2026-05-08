import { describe, expect, it } from 'vitest'
import { buildStable } from '../effects/stables'
import type { PlayerState } from '../../contract/types'

const createPlayer = (wood: number): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: {
    food: 0,
    wood,
    clay: 0,
    reed: 0,
    stone: 0,
    grain: 0,
    vegetable: 0,
    sheep: 0,
    boar: 0,
    cattle: 0,
    begging: 0,
  },
  rooms: 2,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [
    { row: 2, col: 0 },
    { row: 1, col: 0 },
  ],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false, activeModifiers: [], cardStates: {},
})

describe('stables', () => {
  it('builds a stable and consumes wood', () => {
    const player = createPlayer(2)
    const result = buildStable(player)
    expect(result.type).toBe('ok')
    expect(player.stableTiles.length).toBe(1)
    expect(player.resources.wood).toBe(0)
  })

  it('fails when resources are insufficient', () => {
    const player = createPlayer(1)
    const result = buildStable(player)
    expect(result.type).toBe('fail')
  })
})
