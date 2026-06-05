import { describe, expect, it } from 'vitest'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'
import type { ActionSpace, ComplexCost, GameState, PaymentResourceMap, PlayerState } from '../../shared/contract/types'
import { registerCustomCard } from '../../shared/cards/custom-registry'
import { isComplexCost, resolveCardCostWithModifiers } from '../../shared/actions/payment/internal'

import '../../shared/cards/A/A143_Stonecutter'
import '../../shared/cards/B/B95_MasterBricklayer'
import '../../shared/cards/C/C122_Bricklayer'
import '../../shared/cards/C/C95_BasketWeaver'
import '../../shared/cards/D/D95_SiteManager'
import '../../shared/cards/D/D96_Furnisher'
import '../../shared/cards/D/D80_BrickHammer'
import '../../shared/cards/D/D117_WoodExpert'
import '../../shared/cards/E/E156_ClaypitOwner'
import '../../shared/cards/E/E109_BraidMaker'
import '../../shared/cards/E/E27_PiggyBank'

registerCustomCard({
  cardType: 'minor',
  cardJson: {
    id: 'CUSTOM_D80_NoSummedClay',
    name: 'D80 No Summed Clay',
    deck: 'community',
    number: 1,
    desc: [],
    cost: { clay: 1 },
    altCosts: [{ clay: 1 }, { wood: 2 }],
  },
}, { allowGlobal: true })

const makePlayer = (id: string): PlayerState => ({
  id,
  name: id,
  color: id === 'p1' ? 'red' : 'blue',
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
  workers: [],
  rooms: 2,
  houseType: 'wood',
  fields: [],
  roomTiles: [],
  stableTiles: [],
  fences: 0,
  improvements: [],
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
} as PlayerState)

const makeState = (players: PlayerState[]): GameState => ({
  round: 1,
  currentPlayerIndex: 0,
  players,
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

const space = { id: 'improvement' } as ActionSpace

const findListener = (id: string) => {
  const listener = getRegisteredCardListeners().find((entry) => entry.id === id)
  expect(listener, `listener not registered: ${id}`).toBeDefined()
  return listener!
}

const resolveImprovementCost = (
  player: PlayerState,
  cardId: string,
  baseCost: PaymentResourceMap,
  actionCardId?: string,
) => resolveCardCostWithModifiers(
  makeState([player]),
  player,
  'improvement',
  cardId,
  baseCost,
  actionCardId,
)

const expectFeesWithSources = (
  cost: PaymentResourceMap | ComplexCost,
  expected: Array<{ fee: PaymentResourceMap, sources: string[] }>,
) => {
  expect(isComplexCost(cost)).toBe(true)
  if (!isComplexCost(cost)) return
  expect(cost.fees ?? (cost.fee ? [cost.fee] : [])).toEqual(expected.map((entry) => entry.fee))
  expect(cost.costCandidateSourceCards ?? expected.map(() => [])).toEqual(expected.map((entry) => entry.sources))
}

const runAfterImprovement = (
  listenerId: string,
  builtCardId: string,
  player: PlayerState,
  state: GameState,
) => executeCardListener(findListener(listenerId), {
  state,
  player,
  space,
  actionId: 'improvement',
  phase: 'after',
  choice: `minor:${builtCardId}`,
  result: { type: 'ok' },
} as CardListenerContext)

describe('printed improvement cost listeners', () => {
  it('D80 ignores its own non-clay altCosts when checking printed clay cost', () => {
    const player = makePlayer('p1')
    player.minorPlayed = ['D80_BrickHammer']
    const result = runAfterImprovement(
      'D80-brick-hammer-after-improvement',
      'D80_BrickHammer',
      player,
      makeState([player]),
    )

    expect(result).toBeUndefined()
  })

  it('D80 does not add clay from cost and altCosts together', () => {
    const player = makePlayer('p1')
    player.minorPlayed = ['D80_BrickHammer']
    const result = runAfterImprovement(
      'D80-brick-hammer-after-improvement',
      'CUSTOM_D80_NoSummedClay',
      player,
      makeState([player]),
    )

    expect(result).toBeUndefined()
  })

  it('E156 detects clay in minor altCosts', () => {
    const trigger = makePlayer('p1')
    const owner = makePlayer('p2')
    owner.occupationPlayed = ['E156_ClaypitOwner']
    const result = runAfterImprovement(
      'E156-claypit-owner-opponent-improvement-clay',
      'E30_ChildsToy',
      trigger,
      makeState([trigger, owner]),
    )

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      sourceCard: 'E156_ClaypitOwner',
      params: { food: 1, clay: 1 },
    })
  })

  it('D117 derives candidate costs for improvements with wood in minor altCosts', () => {
    const player = makePlayer('p1')
    player.occupationPlayed = ['D117_WoodExpert']
    const result = executeCardListener(findListener('D117-wood-expert-compute-costs-improvement'), {
      state: makeState([player]),
      player,
      space,
      actionId: 'improvement',
      phase: 'computeCosts',
      cardId: 'E30_ChildsToy',
    } as CardListenerContext)

    expect(result?.candidateDerivers).toHaveLength(1)
    const deriver = result?.candidateDerivers?.[0]
    expect(deriver).toMatchObject({
      id: 'D117_WoodExpert:wood-expert-cost-deriver',
      sourceCardId: 'D117_WoodExpert',
    })
    expect(deriver?.derive({
      cost: { wood: 1 },
      metadata: { sourceCards: [] },
      applied: new Set(),
    }, {
      actionId: 'improvement',
      targetCardId: 'E30_ChildsToy',
      targetPlayKind: 'minor',
      targetCardTypes: ['minor'],
    })).toEqual([{ cost: { wood: 0, food: 1 } }])
  })

  it('D117 deriver is inert for candidates without wood', () => {
    const player = makePlayer('p1')
    player.occupationPlayed = ['D117_WoodExpert']
    const result = executeCardListener(findListener('D117-wood-expert-compute-costs-improvement'), {
      state: makeState([player]),
      player,
      space,
      actionId: 'improvement',
      phase: 'computeCosts',
      cardId: 'Major_Basket',
    } as CardListenerContext)

    const deriver = result?.candidateDerivers?.[0]
    expect(deriver?.derive({
      cost: { reed: 2 },
      metadata: { sourceCards: [] },
      applied: new Set(),
    }, {
      actionId: 'improvement',
      targetCardId: 'Major_Basket',
      targetPlayKind: 'major',
      targetCardTypes: ['major'],
    })).toEqual([])
  })

  it('A143 appends a stone-discount candidate and preserves the printed candidate', () => {
    const player = makePlayer('p1')
    player.occupationPlayed = ['A143_Stonecutter']

    expectFeesWithSources(
      resolveImprovementCost(player, 'Major_Basket', { reed: 2, stone: 2 }),
      [
        { fee: { reed: 2, stone: 2 }, sources: [] },
        { fee: { reed: 2, stone: 1 }, sources: ['A143_Stonecutter'] },
      ],
    )
  })

  it('B95 appends a room-count stone-discount candidate for major improvements', () => {
    const player = makePlayer('p1')
    player.occupationPlayed = ['B95_MasterBricklayer']
    player.rooms = 4

    expectFeesWithSources(
      resolveImprovementCost(player, 'Major_Basket', { reed: 2, stone: 2 }),
      [
        { fee: { reed: 2, stone: 2 }, sources: [] },
        { fee: { reed: 2 }, sources: ['B95_MasterBricklayer'] },
      ],
    )
  })

  it('C122 appends a clay-discount candidate and is inert without clay', () => {
    const player = makePlayer('p1')
    player.occupationPlayed = ['C122_Bricklayer']

    expectFeesWithSources(
      resolveImprovementCost(player, 'Major_Fireplace1', { clay: 2, stone: 1 }),
      [
        { fee: { clay: 2, stone: 1 }, sources: [] },
        { fee: { clay: 1, stone: 1 }, sources: ['C122_Bricklayer'] },
      ],
    )
    expect(resolveImprovementCost(player, 'Major_Basket', { reed: 2, stone: 2 })).toEqual({ reed: 2, stone: 2 })
  })

  it('C95 appends the fixed Basketmaker price only for its immediate purchase', () => {
    const player = makePlayer('p1')
    player.occupationPlayed = ['C95_BasketWeaver']

    expectFeesWithSources(
      resolveImprovementCost(player, 'Major_Basket', { reed: 2, stone: 2 }, 'C95_BasketWeaver'),
      [
        { fee: { reed: 2, stone: 2 }, sources: [] },
        { fee: { reed: 1, stone: 1 }, sources: ['C95_BasketWeaver'] },
      ],
    )
    expect(resolveImprovementCost(player, 'Major_Basket', { reed: 2, stone: 2 })).toEqual({ reed: 2, stone: 2 })
  })

  it('D95 appends every applicable food replacement candidate for its immediate major', () => {
    const player = makePlayer('p1')
    player.occupationPlayed = ['D95_SiteManager']

    expectFeesWithSources(
      resolveImprovementCost(player, 'Major_Joinery', { wood: 2, stone: 2 }, 'D95_SiteManager'),
      [
        { fee: { wood: 2, stone: 2 }, sources: [] },
        { fee: { food: 1, wood: 1, stone: 2 }, sources: ['D95_SiteManager'] },
        { fee: { food: 1, wood: 2, stone: 1 }, sources: ['D95_SiteManager'] },
        { fee: { food: 2, wood: 1, stone: 1 }, sources: ['D95_SiteManager'] },
      ],
    )
  })

  it('D96 appends a one-wood discount candidate for Furnisher improvements', () => {
    const player = makePlayer('p1')
    player.occupationPlayed = ['D96_Furnisher']

    expectFeesWithSources(
      resolveImprovementCost(player, 'Major_Joinery', { wood: 2, stone: 2 }, 'D96_Furnisher'),
      [
        { fee: { wood: 2, stone: 2 }, sources: [] },
        { fee: { wood: 1, stone: 2 }, sources: ['D96_Furnisher'] },
      ],
    )
  })

  it('E109 appends the fixed Basketmaker price', () => {
    const player = makePlayer('p1')
    player.occupationPlayed = ['E109_BraidMaker']

    expectFeesWithSources(
      resolveImprovementCost(player, 'Major_Basket', { reed: 2, stone: 2 }),
      [
        { fee: { reed: 2, stone: 2 }, sources: [] },
        { fee: { reed: 1, stone: 1 }, sources: ['E109_BraidMaker'] },
      ],
    )
  })

  it('E27 appends a free major candidate when Piggy Bank is flagged', () => {
    const player = makePlayer('p1')
    player.minorPlayed = ['E27_PiggyBank']
    player.cardStates = { E27_PiggyBank: { flagged: true } }

    expectFeesWithSources(
      resolveImprovementCost(player, 'Major_Joinery', { wood: 2, stone: 2 }),
      [
        { fee: { wood: 2, stone: 2 }, sources: [] },
        { fee: {}, sources: ['E27_PiggyBank'] },
      ],
    )
  })
})
