import { afterEach, describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../../contract/types'
import { requireActiveCardRegistry } from '../../../cards/active-registry'
import { readCardResourceStats } from '../../../cards/helpers/card-state'
import { PaymentSolver } from '../../payment'
import { playImprovement } from '../improvement'

import '../../../cards/A/A053_Claypipe'
import '../../../cards/D/D020_TurnwrestPlow'
import '../../../cards/D/D096_Furnisher'
import '../../../cards/D/D117_WoodExpert'

const SOURCE_CARD = 'HookCandidate'
const LISTENER_ID = 'hook-candidate-cost'

const createState = (): GameState =>
  ({
    round: 1,
    currentPlayerIndex: 0,
    players: [],
    actionSpaces: [],
    log: [],
    roundActionOrder: [],
    gameSeed: 1,
    availableMajorImprovements: ['Major_Fireplace1'],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    workPhaseObtainedResources: {},
  }) as unknown as GameState

const createPlayer = (): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    color: 'red',
    resources: {
      wood: 0,
      clay: 2,
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
    rooms: 2,
    houseType: 'wood',
    fields: [],
    fences: 0,
    roomTiles: [],
    stableTiles: [],
    improvements: [],
    minorHand: ['A053_Claypipe'],
    minorPlayed: [],
    occupationHand: [],
    occupationPlayed: [SOURCE_CARD],
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
  }) as unknown as PlayerState

const registerCandidateListener = (discount: { clay: number }) => {
  requireActiveCardRegistry('improvement-cost-candidates').registerListener({
    id: LISTENER_ID,
    cardIds: [SOURCE_CARD],
    phases: ['computeCosts'],
    actions: ['improvement'],
    handler: () => undefined,
    deriveCardCostCandidate: (_context, candidate) =>
      PaymentSolver.discountCardCostCandidate(candidate, SOURCE_CARD, discount),
  })
}

// ADR 0004 amendment: the dominated printed cost is pruned, the sourced free
// candidate is the single remaining option and the purchase auto-resolves.
const expectAutoResolvedFreePayment = (
  result: ReturnType<typeof playImprovement>,
  player: PlayerState,
) => {
  expect(result.type).toBe('ok')
  expect(readCardResourceStats(player, SOURCE_CARD)?.saved).toBeDefined()
}

describe('improvement card cost candidates', () => {
  afterEach(() => {
    requireActiveCardRegistry('improvement-cost-candidates')
      .removeListenersWhere((listener) => listener.id === LISTENER_ID)
  })

  it('runs major improvement payment through candidate metadata', () => {
    registerCandidateListener({ clay: 2 })
    const state = createState()
    const player = createPlayer()
    state.players = [player]

    const clayBefore = player.resources.clay
    const result = playImprovement(state, player, 'major:Major_Fireplace1', 'any')

    expectAutoResolvedFreePayment(result, player)
    expect(player.resources.clay).toBe(clayBefore)
  })

  it('runs minor improvement payment through candidate metadata', () => {
    registerCandidateListener({ clay: 1 })
    const state = createState()
    const player = createPlayer()
    player.resources.clay = 1
    state.players = [player]

    const clayBefore = player.resources.clay
    const result = playImprovement(state, player, 'minor:A053_Claypipe', 'any')

    expectAutoResolvedFreePayment(result, player)
    expect(player.resources.clay).toBe(clayBefore)
  })

  it('records selected card-purchase candidate attribution on the source card', () => {
    registerCandidateListener({ clay: 2 })
    const state = createState()
    const player = createPlayer()
    state.players = [player]

    const result = playImprovement(state, player, 'major:Major_Fireplace1', 'any')

    expect(result.type).toBe('ok')
    expect(readCardResourceStats(player, SOURCE_CARD)?.saved).toEqual({ clay: 2 })
  })

  it('records Wood Expert saved and paid attribution without attributing it to Turnwrest Plow', () => {
    const state = createState()
    const player = createPlayer()
    player.resources = { ...player.resources, wood: 3, food: 1 }
    player.minorHand = ['D020_TurnwrestPlow']
    player.occupationPlayed = ['D117_WoodExpert', 'OtherOccupation']
    state.players = [player]

    const request = playImprovement(state, player, 'minor:D020_TurnwrestPlow', 'any')
    expect(request.type).toBe('request')
    if (request.type !== 'request' || request.request.kind !== 'choice') return
    const option = request.request.options.find((entry) =>
      Array.isArray(entry.labelParams.sourceCards)
        && entry.labelParams.sourceCards.includes('D117_WoodExpert'),
    )
    expect(option).toBeDefined()

    const result = playImprovement(state, player, option!.value, 'any')

    expect(result.type).toBe('ok')
    expect(readCardResourceStats(player, 'D117_WoodExpert')).toMatchObject({
      saved: { wood: 2 },
      paid: { food: 1 },
    })
    expect(readCardResourceStats(player, 'D020_TurnwrestPlow')?.paid).toBeUndefined()
  })

  it('does not record optional derived attribution when the original candidate is selected', () => {
    const state = createState()
    const player = createPlayer()
    player.resources = { ...player.resources, wood: 3, food: 1 }
    player.minorHand = ['D020_TurnwrestPlow']
    player.occupationPlayed = ['D117_WoodExpert', 'OtherOccupation']
    state.players = [player]

    const request = playImprovement(state, player, 'minor:D020_TurnwrestPlow', 'any')
    expect(request.type).toBe('request')
    if (request.type !== 'request' || request.request.kind !== 'choice') return
    const option = request.request.options.find((entry) =>
      !Array.isArray(entry.labelParams.sourceCards),
    )
    expect(option).toBeDefined()

    const result = playImprovement(state, player, option!.value, 'any')

    expect(result.type).toBe('ok')
    expect(readCardResourceStats(player, 'D117_WoodExpert')).toBeUndefined()
    expect(readCardResourceStats(player, 'D020_TurnwrestPlow')?.paid).toBeUndefined()
  })

  it('records Furnisher saved attribution when its discounted candidate is selected', () => {
    const state = createState()
    const player = createPlayer()
    player.resources = { ...player.resources, wood: 3 }
    player.minorHand = ['D020_TurnwrestPlow']
    player.occupationPlayed = ['D096_Furnisher', 'OtherOccupation']
    state.players = [player]

    const result = playImprovement(
      state,
      player,
      'minor:D020_TurnwrestPlow',
      'any',
      undefined,
      'D096_Furnisher',
    )

    expect(result.type).toBe('ok')
    expect(readCardResourceStats(player, 'D096_Furnisher')?.saved).toEqual({ wood: 1 })
    expect(readCardResourceStats(player, 'D020_TurnwrestPlow')?.paid).toBeUndefined()
  })
})
