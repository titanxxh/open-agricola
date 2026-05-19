import { describe, expect, it } from 'vitest'
import { computeAllBuyableCombinations } from '../enumerate'
import type { PlayerState, TradeModifier } from '../../../../contract/types'

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
  stats: {} as any,
})

describe('A88_HedgeKeeper fencing regression — scope:action default, max=3, nb absent', () => {
  const a88: TradeModifier = {
    type: 'trade',
    cardId: 'A88_HedgeKeeper',
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
    const swap = cheapest.tradesUsed.find((t) => t.trade.sourceId === 'A88_HedgeKeeper')
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

  it('Σ-times constraint NOT applied (nb absent for fencing); swap count bounded only by trade.max=3', () => {
    // Even with abundant wood, the Σ-times ≤ nb constraint should NOT apply
    // because nb is undefined for fencing costs. Action-scope cap = trade.max.
    const sols = computeAllBuyableCombinations(
      mkPlayer({ wood: 5 }, [a88]),
      { fee: { wood: 5 } },
      undefined,
      'fencing',
    )
    expect(sols.length).toBeGreaterThan(0)
    const swapCounts = sols.map(
      (s) => s.tradesUsed.find((t) => t.trade.sourceId === 'A88_HedgeKeeper')?.times ?? 0,
    )
    expect(Math.max(...swapCounts)).toBe(3)
  })
})
