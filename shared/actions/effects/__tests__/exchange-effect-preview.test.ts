import { describe, expect, it } from 'vitest'

import { anytimeExchangeAction } from '../exchange'
import type { GameState, PlayerState, ActionSpace } from '../../../contract/types'
import type { ActionExecutionContext } from '../../../contract/types'

const createPlayer = (): PlayerState =>
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
    improvements: ['Major_Fireplace1'],
    minorHand: [],
    minorPlayed: [],
    occupationHand: [],
    occupationPlayed: [],
    houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    pastures: [],
    fenceSegments: [],
    majorEffects: { wellRounds: 0 },
    startPlayer: false,
    activeModifiers: [],
    cardStates: {},
  }) as PlayerState

const createState = (player: PlayerState): GameState =>
  ({
    round: 3,
    roundPhase: 'work',
    currentPlayerIndex: 0,
    players: [player],
    actionSpaces: [],
    log: [],
    roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    workPhaseObtainedResources: {},
  }) as GameState

const createSpace = (): ActionSpace =>
  ({
    id: 'exchange',
    nameKey: 'actions.exchange.name',
    descriptionKey: 'actions.exchange.description',
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
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
    takenBy: [],
  }) as ActionSpace

describe('anytimeExchangeAction effectPreview', () => {
  it('builds scaled resource-exchange previews from affordable cookery trades', () => {
    const player = createPlayer()
    player.resources.sheep = 2
    const state = createState(player)

    const result = anytimeExchangeAction.execute({
      state,
      player,
      space: createSpace(),
    } as unknown as ActionExecutionContext)

    expect(result.type).toBe('request')
    if (result.type !== 'request') return
    expect(result.request.kind).toBe('choice')
    if (result.request.kind !== 'choice') return
    expect(result.request.options[0]).toMatchObject({
      value: 'trade:0:2',
      sourceCard: 'Major_Fireplace1',
      effectPreview: {
        kind: 'resourceExchange',
        resourcesPaid: { sheep: 2 },
        resourcesGained: { food: 4 },
      },
    })
  })

  it('returns explicit paid and gained resources for a selected trade', () => {
    const player = createPlayer()
    player.resources.sheep = 2
    const state = createState(player)

    const result = anytimeExchangeAction.resolveChoice!({
      state,
      player,
      space: createSpace(),
    } as unknown as ActionExecutionContext, 'trade:0:2')

    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({ sheep: 2 })
    expect(result.resourcesGained).toEqual({ food: 4 })
    expect(player.resources.sheep).toBe(0)
    expect(player.resources.food).toBe(4)
  })

  it('returns explicit paid and gained resources for bulk trades', () => {
    const player = createPlayer()
    player.resources.sheep = 2
    const state = createState(player)

    const result = anytimeExchangeAction.resolveChoice!({
      state,
      player,
      space: createSpace(),
    } as unknown as ActionExecutionContext, 'bulk:0=2')

    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({ sheep: 2 })
    expect(result.resourcesGained).toEqual({ food: 4 })
  })
})
