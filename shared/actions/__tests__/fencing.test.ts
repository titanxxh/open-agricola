import { describe, expect, it } from 'vitest'
import { A88_HedgeKeeper } from '../../cards/A/A88_HedgeKeeper'
import {
  buildPasture,
  canStartFencing,
} from '../effects/fencing'
import type { PlayerState, TradeModifier } from '../../game/types'

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
  startPlayer: false, activeModifiers: [], cardStates: {},
})

const hedgeKeeperModifier = { ...A88_HedgeKeeper.modifier } as TradeModifier

describe('fencing pasture', () => {
  it('builds a pasture and consumes wood', () => {
    const player = createPlayer()
    const result = buildPasture(player, { size: 2, stables: 1, fenceCost: 6 })
    expect(result.type).toBe('ok')
    expect(player.pastures.length).toBe(1)
    expect(player.fences).toBe(6)
    expect(player.resources.wood).toBe(2)
  })

  it('allows starting fencing with Hedge Keeper discount', () => {
    const player = createPlayer()
    player.resources.wood = 1
    player.activeModifiers = [hedgeKeeperModifier]

    expect(canStartFencing(player)).toBe(true)
  })

  it('applies fencing discount when building a minimum pasture', () => {
    const player = createPlayer()
    player.resources.wood = 1
    player.activeModifiers = [hedgeKeeperModifier]

    const result = buildPasture(player, { size: 1, stables: 0, fenceCost: 4 })

    expect(result.type).toBe('ok')
    expect(player.pastures.length).toBe(1)
    expect(player.fences).toBe(4)
    expect(player.resources.wood).toBe(0)
  })
})
