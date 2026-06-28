import { describe, expect, it } from 'vitest'
import { computeAllBuyableCombinations } from '../enumerate'
import {
  executeResolvedTypedFlatPayment,
  resolveTypedFlatPaymentSelection,
} from '../typed-flat'
import type { GameState, PlayerState, TradeModifier } from '../../../../contract/types'

const mkPlayer = (
  resources: Partial<PlayerState['resources']>,
  modifiers: TradeModifier[],
): PlayerState => ({
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
    ...resources,
  },
  workers: [],
  rooms: 1,
  houseType: 'wood',
  fields: [],
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
  activeModifiers: modifiers,
  cardStates: {},
  supplyTokensConsumed: {},
  stats: {} as any,
})

const mkState = (player: PlayerState): GameState => ({
  players: [player],
} as unknown as GameState)

describe('A088_HedgeKeeper fencing regression — scope:action default, max=3, nb absent', () => {
  const a88: TradeModifier = {
    type: 'trade',
    cardId: 'A088_HedgeKeeper',
    appliesTo: ['fencing'],
    from: {},
    to: { wood: 1 },
    max: 3,
    // scope omitted — defaults to 'action' per spec §3.2.
  }

  it('build 5 fences with 2 wood + A88 → 3 free swaps, pays only 2 wood', () => {
    const sols = computeAllBuyableCombinations(
      mkPlayer({ wood: 2 }, [a88]),
      { fee: { wood: 5 } },
      undefined,
      'fencing',
    )
    expect(sols.length).toBeGreaterThan(0)
    // Best solution: 3 free wood swaps → pays the remaining 2 wood.
    const cheapest = sols[0]!
    expect(cheapest.resourcesPaid.wood).toBe(2)
    const swap = cheapest.tradesUsed.find((t) => t.trade.sourceId === 'A088_HedgeKeeper')
    expect(swap).toBeDefined()
    expect(swap!.times).toBe(3)
  })

  it('build 5 fences with 0 wood + A88 → unaffordable (max 3 free, but need 5)', () => {
    const sols = computeAllBuyableCombinations(
      mkPlayer({ wood: 0 }, [a88]),
      { fee: { wood: 5 } },
      undefined,
      'fencing',
    )
    // No affordable solution: 5 wood needed, A88 covers at most 3, no wood left for the rest.
    expect(sols.length).toBe(0)
  })

  it('action-scope fencing trade is bounded only by trade.max=3', () => {
    // A88 is an action-scope trade on the total fencing cost, so the cap is
    // trade.max rather than a per-unit cost-row rule.
    const sols = computeAllBuyableCombinations(
      mkPlayer({ wood: 5 }, [a88]),
      { fee: { wood: 5 } },
      undefined,
      'fencing',
    )
    expect(sols.length).toBeGreaterThan(0)
    const swapCounts = sols.map(
      (s) => s.tradesUsed.find((t) => t.trade.sourceId === 'A088_HedgeKeeper')?.times ?? 0,
    )
    expect(Math.max(...swapCounts)).toBe(3)
  })
})

describe('typed-flat supply token selection', () => {
  const failure = { type: 'fail', errorKey: 'log.action' } as const

  it('selects and executes supply-token payment when state is provided', () => {
    const player = mkPlayer({}, [])
    const state = mkState(player)

    const selected = resolveTypedFlatPaymentSelection(
      player,
      { stable: 1 },
      'pay:stable',
      undefined,
      failure,
      'stables',
      state,
    )

    expect(selected.type).toBe('selected')
    if (selected.type !== 'selected') return
    executeResolvedTypedFlatPayment(player, selected, 'stables', state)
    expect(player.supplyTokensConsumed?.stable).toBe(1)
    expect(player.stableTiles).toHaveLength(0)
  })

  it('does not select supply-token payment without state', () => {
    const player = mkPlayer({}, [])

    const selected = resolveTypedFlatPaymentSelection(
      player,
      { stable: 1 },
      'pay:stable',
      undefined,
      failure,
      'stables',
    )

    expect(selected).toEqual(failure)
    expect(player.supplyTokensConsumed?.stable).toBeUndefined()
  })
})

describe('typed-flat payment budgets', () => {
  it('rejects solutions whose final paid resource exceeds the budget', () => {
    const sols = computeAllBuyableCombinations(
      mkPlayer({ wood: 4 }, []),
      { fee: { wood: 4 }, paymentBudget: { wood: 3 } },
      undefined,
      'fencing',
    )

    expect(sols).toHaveLength(0)
  })

  it('keeps solutions whose discounted final payment fits the budget', () => {
    const sols = computeAllBuyableCombinations(
      mkPlayer({ wood: 4 }, []),
      {
        fee: { wood: 4 },
        bonuses: [{ discount: { wood: 1 }, sources: ['Test_Discount'] }],
        paymentBudget: { wood: 3 },
      },
      undefined,
      'fencing',
    )

    expect(sols).toHaveLength(1)
    expect(sols[0]?.resourcesPaid.wood).toBe(3)
  })
})
