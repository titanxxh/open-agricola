import { afterEach, describe, expect, it } from 'vitest'
import type { GameState, PaymentResourceMap, PlayerState } from '../../contract/types'
import { requireActiveCardRegistry } from '../active-registry'
import { playImprovement } from '../../actions/effects/improvement'
import { resolveCardCostWithModifiersDetailed } from '../../actions/payment/internal'
import type { CardListenerRegistration } from '../card-listeners'
import { createInitialPlayerStats } from '../../session/stats'

import '../A/A27_OvenSite'
import '../B/B65_GrainDepot'
import '../C/C95_BasketWeaver'
import '../D/D95_SiteManager'
import '../E/E109_BraidMaker'
import '../E/E27_PiggyBank'

const HOOK_CARD = 'HookFreeGrainDepot'

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
    availableMajorImprovements: [],
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
    stats: createInitialPlayerStats({ isFirstPlayer: false }),
  }) as unknown as PlayerState

const expectPaymentRequest = (result: ReturnType<typeof playImprovement>) => {
  expect(result.type).toBe('request')
  if (result.type !== 'request') return []
  expect(result.promptKey).toBe('prompt.selectPayment')
  expect(result.request.kind).toBe('choice')
  return result.request.kind === 'choice' ? result.request.options : []
}

const hasPaidResources = (
  option: { labelParams?: Record<string, unknown> },
  expected: PaymentResourceMap,
) => {
  const actual = (option.labelParams?.resourcesPaid ?? {}) as PaymentResourceMap
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)])
  return [...keys].every((key) =>
    (actual[key as keyof PaymentResourceMap] ?? 0) === (expected[key as keyof PaymentResourceMap] ?? 0),
  )
}

describe('fixed card-purchase cost candidates', () => {
  afterEach(() => {
    requireActiveCardRegistry('card-cost-fixed-candidates')
      .removeListenersWhere((listener) => listener.id === 'hook-free-grain-depot')
  })

  it('C95 appends a fixed Basketmaker payment candidate and keeps the original', () => {
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    state.availableMajorImprovements = ['Major_Basket']
    player.occupationPlayed = ['C95_BasketWeaver']
    player.resources.reed = 2
    player.resources.stone = 2

    const result = playImprovement(
      state,
      player,
      'major:Major_Basket',
      'any',
      undefined,
      'C95_BasketWeaver',
    )

    const options = expectPaymentRequest(result)
    expect(options.some((option) => hasPaidResources(option, { reed: 2, stone: 2 }))).toBe(true)
    const fixed = options.find((option) => hasPaidResources(option, { reed: 1, stone: 1 }))
    expect(fixed?.labelParams.sourceCards).toEqual(['C95_BasketWeaver'])
    expect(fixed?.effectPreview).toMatchObject({
      resourcesPaid: { reed: 1, stone: 1 },
      sourceCards: ['C95_BasketWeaver'],
    })
  })

  it('E109 appends a fixed Basketmaker payment candidate during ordinary improvement buys', () => {
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    state.availableMajorImprovements = ['Major_Basket']
    player.occupationPlayed = ['E109_BraidMaker']
    player.resources.reed = 2
    player.resources.stone = 2

    const result = playImprovement(state, player, 'major:Major_Basket', 'any')

    const options = expectPaymentRequest(result)
    expect(options.some((option) => hasPaidResources(option, { reed: 2, stone: 2 }))).toBe(true)
    const fixed = options.find((option) => hasPaidResources(option, { reed: 1, stone: 1 }))
    expect(fixed?.labelParams.sourceCards).toEqual(['E109_BraidMaker'])
    expect(fixed?.effectPreview).toMatchObject({
      resourcesPaid: { reed: 1, stone: 1 },
      sourceCards: ['E109_BraidMaker'],
    })
  })

  it('A27 appends a fixed oven payment candidate and keeps the printed oven cost', () => {
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    state.availableMajorImprovements = ['Major_ClayOven']
    player.minorPlayed = ['A27_OvenSite']
    player.resources.clay = 3
    player.resources.stone = 1

    const result = playImprovement(
      state,
      player,
      'major:Major_ClayOven',
      'any',
      undefined,
      'A27_OvenSite',
    )

    const options = expectPaymentRequest(result)
    expect(options.some((option) => hasPaidResources(option, { clay: 3, stone: 1 }))).toBe(true)
    const fixed = options.find((option) => hasPaidResources(option, { clay: 1, stone: 1 }))
    expect(fixed?.labelParams.sourceCards).toEqual(['A27_OvenSite'])
    expect(fixed?.effectPreview).toMatchObject({
      resourcesPaid: { clay: 1, stone: 1 },
      sourceCards: ['A27_OvenSite'],
    })
  })

  it('E27 appends a free major improvement payment candidate and keeps the original', () => {
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    state.availableMajorImprovements = ['Major_Joinery']
    player.minorPlayed = ['E27_PiggyBank']
    player.cardStates = { E27_PiggyBank: { flagged: true } }
    player.resources.wood = 2
    player.resources.stone = 2

    const result = playImprovement(state, player, 'major:Major_Joinery', 'any')

    const options = expectPaymentRequest(result)
    expect(options.some((option) => hasPaidResources(option, { wood: 2, stone: 2 }))).toBe(true)
    const free = options.find((option) => hasPaidResources(option, {}))
    expect(free?.labelParams.sourceCards).toEqual(['E27_PiggyBank'])
    expect(free?.effectPreview).toMatchObject({
      resourcesPaid: {},
      sourceCards: ['E27_PiggyBank'],
    })
  })

  it('D95 derives replacement candidates for every non-empty subset of present building resources', () => {
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    player.occupationPlayed = ['D95_SiteManager']

    const result = resolveCardCostWithModifiersDetailed(
      state,
      player,
      'improvement',
      'Major_Joinery',
      { wood: 2, stone: 2 },
      'D95_SiteManager',
    )

    expect(result.cost).toMatchObject({
      fees: [
        { wood: 2, stone: 2 },
        { wood: 1, stone: 2, food: 1 },
        { wood: 2, stone: 1, food: 1 },
        { wood: 1, stone: 1, food: 2 },
      ],
    })
    expect('bonuses' in result.cost).toBe(false)
    expect(result.candidateMetadataByFeeIndex).toEqual({
      0: { originalFeeIndex: 0, sources: [] },
      1: { originalFeeIndex: 0, sources: ['D95_SiteManager'] },
      2: { originalFeeIndex: 0, sources: ['D95_SiteManager'] },
      3: { originalFeeIndex: 0, sources: ['D95_SiteManager'] },
    })
  })

  it('B65 keeps the original path identity when a derived payment candidate is selected', () => {
    const hook: CardListenerRegistration = {
      id: 'hook-free-grain-depot',
      cardIds: [HOOK_CARD],
      phases: ['computeCosts'],
      actions: ['improvement'],
      computeCardCostCandidates: (context, candidates) => {
        if (context.cardId !== 'B65_GrainDepot') return [...candidates]
        return [
          ...candidates,
          ...candidates
            .filter((candidate) => candidate.originalFeeIndex === 1)
            .map((candidate) => ({
              resources: {},
              originalFeeIndex: candidate.originalFeeIndex,
              sources: [...candidate.sources, HOOK_CARD],
            })),
        ]
      },
    }
    requireActiveCardRegistry('card-cost-fixed-candidates').registerListener(hook)

    const state = createState()
    const player = createPlayer()
    state.players = [player]
    player.occupationPlayed = [HOOK_CARD]
    player.minorHand = ['B65_GrainDepot']
    player.resources.wood = 2
    player.resources.clay = 2
    player.resources.stone = 2

    const request = playImprovement(state, player, 'minor:B65_GrainDepot', 'any')
    const options = expectPaymentRequest(request)
    const free = options.find((option) => hasPaidResources(option, {}))
    expect(free?.labelParams.sourceCards).toEqual([HOOK_CARD])

    const result = playImprovement(state, player, free!.value, 'any')

    expect(result.type).toBe('flow')
    expect(state.pendingFutureMeeples).toEqual([
      expect.objectContaining({
        cardId: 'B65_GrainDepot',
        count: 3,
        resources: { grain: 1 },
      }),
    ])
  })
})
