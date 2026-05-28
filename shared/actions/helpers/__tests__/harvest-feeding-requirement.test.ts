import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState, Resource } from '../../../contract/types'
import { computeHarvestFeedingRequirement } from '../harvest-feeding-requirement'
import '../../../cards/E/E30_ChildsToy'
import '../../../cards/E/E159_OldMiser'

const emptyResources = (): Resource => ({
  wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
  grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
})

const createPlayer = (
  played: { minor?: string[]; occupation?: string[] } = {},
  activeCount = 2,
  newborns = 0,
): PlayerState => ({
  id: 'p1',
  name: 'p1',
  color: 'red',
  resources: emptyResources(),
  workers: Array.from({ length: 5 }).map((_, index) => ({
    id: String(index + 1),
    isActive: index < activeCount,
    isNewborn: index < activeCount && index >= activeCount - newborns,
  })),
  rooms: 2,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: played.minor ?? [],
  occupationHand: [],
  occupationPlayed: played.occupation ?? [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
} as PlayerState)

const createState = (player: PlayerState): GameState => ({
  round: 4,
  currentPlayerIndex: 0,
  players: [player],
  actionSpaces: [],
  log: [],
  roundStartSnapshot: null,
  roundActionOrder: [],
  gameSeed: 1,
  availableMajorImprovements: [],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
  workPhaseObtainedResources: {},
} as GameState)

describe('computeHarvestFeedingRequirement', () => {
  it('uses the base BGA feeding formula without modifiers', () => {
    const player = createPlayer({}, 3, 1)
    expect(computeHarvestFeedingRequirement(createState(player), player)).toBe(5)
  })

  it('adds one food per newborn for E30 Childs Toy', () => {
    const player = createPlayer({ minor: ['E30_ChildsToy'] }, 3, 1)
    expect(computeHarvestFeedingRequirement(createState(player), player)).toBe(6)
  })

  it('subtracts one food per person for E159 Old Miser', () => {
    const player = createPlayer({ occupation: ['E159_OldMiser'] }, 3, 1)
    expect(computeHarvestFeedingRequirement(createState(player), player)).toBe(2)
  })

  it('stacks E30 and E159 as formula modifiers', () => {
    const player = createPlayer({
      minor: ['E30_ChildsToy'],
      occupation: ['E159_OldMiser'],
    }, 3, 1)
    expect(computeHarvestFeedingRequirement(createState(player), player)).toBe(3)
  })
})
