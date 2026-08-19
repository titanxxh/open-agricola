import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState } from '../../contract/types'

import '../E/E088_MasterFencer'

const CARD_ID = 'E088_MasterFencer'

const createPlayer = (): PlayerState =>
  ({
    id: 'p1', name: 'P1', color: 'red',
    resources: {
      wood: 3, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'stone',
    fields: [], roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [CARD_ID], houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    newbornCount: 0, pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    cardStates: {},
  }) as unknown as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 5, roundPhase: 'work', currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

describe('E088_MasterFencer', () => {
  it('passes reference max and free-fence cost through fencePolicy', () => {
    const player = createPlayer()
    const flow = getCardEffect(CARD_ID)!.onRoundStart!(createState(player), player)

    expect(flow?.type).toBe('xor')
    if (flow?.type !== 'xor') return

    const fencingLeaves = flow.children.map((option) =>
      option.type === 'seq' ? option.children[1] : undefined,
    )

    expect(fencingLeaves).toEqual([
      expect.objectContaining({
        actionId: 'fence',
        actionContext: expect.objectContaining({
          fencePolicy: expect.objectContaining({
            segmentBounds: { total: { min: 1, max: 3 } },
            costPolicy: { fence: { wood: 0 } },
          }),
        }),
      }),
      expect.objectContaining({
        actionId: 'fence',
        actionContext: expect.objectContaining({
          fencePolicy: expect.objectContaining({
            segmentBounds: { total: { min: 1, max: 4 } },
            costPolicy: { fence: { wood: 0 } },
          }),
        }),
      }),
    ])
  })
})
