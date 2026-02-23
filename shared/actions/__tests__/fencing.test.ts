import { describe, expect, it } from 'vitest'
import { buildPasture } from '../effects/fencing'
import type { PlayerState } from '../../game/types'

const createPlayer = (): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: {
    wood: 10,
    clay: 0,
    reed: 0,
    stone: 0,
    food: 0,
    grain: 0,
    vegetable: 0,
    sheep: 0,
    boar: 0,
    cattle: 0,
    begging: 0,
  },
  familySize: 2,
  workersAvailable: 2,
  rooms: 2,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  newbornCount: 0,
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
})

describe('fencing pasture', () => {
  it('builds a pasture and consumes wood', () => {
    const player = createPlayer()
    const result = buildPasture(player, { size: 2, stables: 1, fenceCost: 6 })
    expect(result.type).toBe('ok')
    expect(player.pastures.length).toBe(1)
    expect(player.fences).toBe(6)
    expect(player.resources.wood).toBe(2)
  })
})
