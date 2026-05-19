import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../../contract/types'
import { playOccupation } from '../occupation'
import '../../../cards/A/A85_Homekeeper'
import '../../../cards/C/C107_Baker'

const FLOW_CARD_ID = 'C107_Baker'
const OK_CARD_ID = 'A85_Homekeeper'

const createState = (): GameState => ({
  round: 1,
  currentPlayerIndex: 0,
  players: [],
  actionSpaces: [],
  log: [],
  roundStartSnapshot: null,
  roundActionOrder: [],
  gameSeed: 1,
  availableMajorImprovements: ['Major_Fireplace1'],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
  workPhaseObtainedResources: {},
})

const createPlayer = (overrides?: Partial<PlayerState>): PlayerState =>
  ({
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
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
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
    ...overrides,
  }) as PlayerState

describe('occupation play result', () => {
  it('plays plain occupation without legacy log payload', () => {
    const player = createPlayer({
      occupationHand: [OK_CARD_ID],
      resources: {
        wood: 0,
        clay: 0,
        reed: 0,
        stone: 0,
        food: 1,
        grain: 0,
        vegetable: 0,
        sheep: 0,
        boar: 0,
        cattle: 0,
        begging: 0,
      },
    })

    const result = playOccupation(player, OK_CARD_ID, { food: 1 })

    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(player.occupationPlayed).toContain(OK_CARD_ID)
    expect(player.resources.food).toBe(0)
  })

  it('returns flow without legacy log payload', () => {
    const state = createState()
    const player = createPlayer({
      occupationHand: [FLOW_CARD_ID],
      _activeActionBonusSources: ['D95_SiteManager'],
      resources: {
        wood: 0,
        clay: 2,
        reed: 0,
        stone: 0,
        food: 1,
        grain: 1,
        vegetable: 0,
        sheep: 0,
        boar: 0,
        cattle: 0,
        begging: 0,
      },
    })
    state.players = [player]

    const result = playOccupation(player, FLOW_CARD_ID, { food: 1 }, state, 'lessons')

    expect(result.type).toBe('flow')
    if (result.type !== 'flow') return
    expect(player.occupationPlayed).toContain(FLOW_CARD_ID)
  })
})
