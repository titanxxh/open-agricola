import { beforeEach, describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../../contract/types'
import { clearCustomCards, registerCustomCard } from '../../../cards/custom-registry'
import { createInitialPlayerStats } from '../../../session/stats'
import { isMinorImprovementPlayable, playMinorImprovement } from '../improvement'

const CARD_ID = 'CUSTOM_StableTokenCost'

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  name: 'Alice',
  color: 'red',
  resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
  workers: [],
  rooms: 2,
  houseType: 'wood',
  fields: [],
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [CARD_ID],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  extraOccupationsFromCards: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
  stats: createInitialPlayerStats({ isFirstPlayer: false }),
  supplyTokensConsumed: {},
  ...overrides,
})

const makeState = (player: PlayerState): GameState => ({
  round: 1,
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
} as never)

describe('minor improvement supply-token payment', () => {
  beforeEach(() => {
    clearCustomCards()
    registerCustomCard({
      cardType: 'minor',
      cardJson: {
        id: CARD_ID,
        name: 'Stable Token Cost',
        deck: 'CUSTOM',
        number: 1,
        desc: ['Test fixture.'],
        cost: { stable: 1 },
        implemented: true,
      },
    }, { allowGlobal: true })
  })

  it('previews and pays a stable supply token through the minor-improvement path', () => {
    const player = makePlayer()
    const state = makeState(player)

    expect(isMinorImprovementPlayable(state, player, CARD_ID, 'improvement')).toBe(true)

    const result = playMinorImprovement(state, player, CARD_ID, 'improvement')

    expect(result.type).toBe('ok')
    expect(player.supplyTokensConsumed?.stable).toBe(1)
    expect(player.stableTiles).toHaveLength(0)
    expect('stable' in player.resources).toBe(false)
    expect(result.type === 'ok' ? result.extraData?.improvementPayment : undefined).toEqual({
      improvementId: CARD_ID,
      resourcesPaid: { stable: 1 },
    })
  })
})
