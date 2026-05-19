import { describe, expect, it } from 'vitest'
import { computeAllBuyableCombinations } from '../enumerate'
import type { CostModifier, PaymentSolution, PlayerState, Resource } from '../../../../contract/types'

const nonZeroPaid = (sol: PaymentSolution): Partial<Resource> => {
  const out: Partial<Resource> = {}
  for (const [k, v] of Object.entries(sol.resourcesPaid)) {
    if ((v ?? 0) !== 0) out[k as keyof Resource] = v
  }
  return out
}

const makePlayer = (modifiers: CostModifier[], houseType: 'wood' | 'clay' | 'stone' = 'clay'): PlayerState => ({
  id: 'p1', name: 'P1', color: 'red',
  resources: { wood: 99, clay: 99, reed: 99, stone: 99, food: 99, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
  workers: [], rooms: 1, houseType, fields: [], roomTiles: [], stableTiles: [],
  improvements: [], minorHand: [], minorPlayed: [], occupationHand: [], occupationPlayed: [],
  extraOccupationsFromCards: [], playedCards: [],
  houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {}, pastures: [], fenceSegments: [],
  majorEffects: { wellRounds: 0 }, startPlayer: false, activeModifiers: modifiers, cardStates: {},
  stats: {} as never,
})

describe('construct cost via unified enumerate (was buildRoomCostPerUnit)', () => {
  // Migrated case 1: D15 multi-key trade — replicate the BGA cost shape and
  // verify the alternative is enumerated.
  it('D15 ClaySupports multi-key unit trade produces 1-room cost variants', () => {
    const player = makePlayer([{
      type: 'trade', cardId: 'D15_ClaySupports', appliesTo: ['construct'],
      scope: 'unit',
      from: { wood: 1 }, to: { clay: 3, reed: 1 },
    }])
    const sols = computeAllBuyableCombinations(
      player,
      { unitFee: { clay: 5, reed: 2 }, nb: 1 },
      undefined,
      'construct',
    )
    // Expect base path AND wood-swap path
    expect(sols.length).toBeGreaterThanOrEqual(2)
    const swapped = sols.find((s) => s.tradesUsed.some((t) => t.times > 0))
    const noSwap = sols.find((s) => s.tradesUsed.every((t) => t.times === 0))
    expect(swapped && nonZeroPaid(swapped)).toEqual({ clay: 2, reed: 1, wood: 1 })
    expect(noSwap && nonZeroPaid(noSwap)).toEqual({ clay: 5, reed: 2 })
  })

  // Migrated case 2: max=1 implicit for unit trades — D15 with nb=1 maxes
  // a single use of the swap (Σ ≤ nb).
  it('D15 unit trade respects Σ-times ≤ nb (nb=1 → at most one swap)', () => {
    const player = makePlayer([{
      type: 'trade', cardId: 'D15_ClaySupports', appliesTo: ['construct'],
      scope: 'unit',
      from: { wood: 1 }, to: { clay: 3, reed: 1 },
    }])
    const sols = computeAllBuyableCombinations(
      player,
      { unitFee: { clay: 5, reed: 2 }, nb: 1 },
      undefined,
      'construct',
    )
    sols.forEach((s) => {
      const totalUnitSwaps = s.tradesUsed.reduce((acc, t) => acc + t.times, 0)
      expect(totalUnitSwaps).toBeLessThanOrEqual(1)
    })
  })
})
