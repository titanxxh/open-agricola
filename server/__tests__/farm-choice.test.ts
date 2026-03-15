import { describe, expect, it } from 'vitest'
import { applyFarmChoice } from '../farm-choice.ts'
import { storePendingFenceBonus } from '../../shared/cards/helpers/pending-fence-bonus'
import type { PlayerState } from '../../shared/game/types.ts'

const createPlayer = (): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: {
    wood: 0,
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
  roomTiles: [
    { row: 2, col: 0 },
    { row: 1, col: 0 },
  ],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: ['E74_AshTrees'],
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
  activeModifiers: [],
  cardStates: {
    E74_AshTrees: { counters: { fences: 5, triggerCount: 0 } },
  },
})

const edgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

describe('farm choice', () => {
  it('consumes reserved Ash Trees fences instead of wood', () => {
    const player = createPlayer()
    storePendingFenceBonus(player, {
      sourceCard: 'E74_AshTrees',
      counterKey: 'fences',
      freeFences: 4,
      incrementTriggerCount: true,
    })

    const result = applyFarmChoice(player, 'fence', {
      edges: edgesForTile(1, 1),
      extraWood: 0,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.player.resources.wood).toBe(0)
    expect(result.player.cardStates?.E74_AshTrees?.counters?.fences).toBe(1)
    expect(result.player.cardStates?.E74_AshTrees?.counters?.triggerCount).toBe(1)
    expect(result.meta).toEqual({ sourceCard: 'E74_AshTrees', usedFreeFences: 4 })
  })
})
