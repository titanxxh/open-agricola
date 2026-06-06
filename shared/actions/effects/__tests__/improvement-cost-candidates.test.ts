import { afterEach, describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../../contract/types'
import { requireActiveCardRegistry } from '../../../cards/active-registry'
import { appendDiscountedCardCostCandidates } from '../../payment/internal'
import { playImprovement } from '../improvement'

import '../../../cards/A/A53_Claypipe'

const SOURCE_CARD = 'HookCandidate'
const LISTENER_ID = 'hook-candidate-cost'

const createState = (): GameState =>
  ({
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
    minorHand: ['A53_Claypipe'],
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
    stats: {},
  }) as unknown as PlayerState

const registerCandidateListener = (discount: { clay: number }) => {
  requireActiveCardRegistry('improvement-cost-candidates').registerListener({
    id: LISTENER_ID,
    cardIds: [SOURCE_CARD],
    phases: ['computeCosts'],
    actions: ['improvement'],
    handler: () => undefined,
    computeCardCostCandidates: (_context, candidates) =>
      appendDiscountedCardCostCandidates(candidates, SOURCE_CARD, discount),
  })
}

const expectSourcedPaymentOption = (result: ReturnType<typeof playImprovement>) => {
  expect(result.type).toBe('request')
  if (result.type !== 'request') return
  expect(result.promptKey).toBe('prompt.selectPayment')
  expect(result.request.kind).toBe('choice')
  if (result.request.kind !== 'choice') return
  const option = result.request.options.find((entry) =>
    Array.isArray(entry.labelParams.sourceCards)
      && entry.labelParams.sourceCards.includes(SOURCE_CARD),
  )
  expect(option?.labelParams).toMatchObject({
    resourcesPaid: {},
    sourceCards: [SOURCE_CARD],
  })
  expect(option?.effectPreview).toMatchObject({
    resourcesPaid: {},
    sourceCards: [SOURCE_CARD],
  })
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

    const result = playImprovement(state, player, 'major:Major_Fireplace1', 'any')

    expectSourcedPaymentOption(result)
  })

  it('runs minor improvement payment through candidate metadata', () => {
    registerCandidateListener({ clay: 1 })
    const state = createState()
    const player = createPlayer()
    player.resources.clay = 1
    state.players = [player]

    const result = playImprovement(state, player, 'minor:A53_Claypipe', 'any')

    expectSourcedPaymentOption(result)
  })
})
