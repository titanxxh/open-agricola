import { describe, expect, it } from 'vitest'
import type {
  CostCandidate,
  CostCandidateDerivationContext,
  CostCandidateDeriver,
} from '../../../cost-candidate-deriver'
import {
  applyCostDeltasToCandidates,
  deriveCostCandidates,
  expandCostCandidates,
} from '../cost-candidates'
import type { ComplexCost, PaymentResourceMap } from '../../../../contract/types'

const context: CostCandidateDerivationContext = {
  actionId: 'improvement',
  targetCardId: 'Major_Basket',
  targetPlayKind: 'major',
  targetCardTypes: ['major'],
}

const candidate = (
  cost: PaymentResourceMap,
  options: Partial<Pick<CostCandidate, 'feeIndex' | 'metadata'>> = {},
): CostCandidate => ({
  cost,
  feeIndex: options.feeIndex,
  metadata: options.metadata ?? { sourceCards: [] },
  applied: new Set(),
})

const signature = (entry: CostCandidate) => ({
  cost: entry.cost,
  sources: entry.metadata.sourceCards,
  feeIndex: entry.feeIndex,
})

describe('cost candidate derivation', () => {
  it('preserves the original candidate and appends D117-style derived candidates', () => {
    const woodExpert: CostCandidateDeriver = {
      id: 'D117_WoodExpert:wood-expert-cost-deriver',
      sourceCardId: 'D117_WoodExpert',
      derive(current) {
        const wood = current.cost.wood ?? 0
        if (wood <= 0) return []
        const reduce = Math.min(2, wood)
        return [{
          cost: {
            ...current.cost,
            wood: wood - reduce,
            food: (current.cost.food ?? 0) + 1,
          },
        }]
      },
    }

    expect(
      deriveCostCandidates([candidate({ wood: 2 })], [woodExpert], context)
        .map(signature),
    ).toEqual([
      { cost: { wood: 2 }, sources: [], feeIndex: undefined },
      { cost: { food: 1 }, sources: ['D117_WoodExpert'], feeIndex: undefined },
    ])
  })

  it('treats negative derived costs as mechanism errors instead of clamping them', () => {
    const badDiscount: CostCandidateDeriver = {
      id: 'BadDiscount',
      sourceCardId: 'BadDiscount',
      derive(current) {
        return [{ cost: { ...current.cost, stone: -1 } }]
      },
    }

    expect(() =>
      deriveCostCandidates([candidate({ wood: 1 })], [badDiscount], context),
    ).toThrow(/candidateDeriver.*BadDiscount.*negative/)
  })

  it('throws on duplicate deriver ids and empty source ids', () => {
    const first: CostCandidateDeriver = {
      id: 'Duplicate',
      sourceCardId: 'First',
      derive: () => [],
    }
    const second: CostCandidateDeriver = {
      id: 'Duplicate',
      sourceCardId: 'Second',
      derive: () => [],
    }
    const emptySource: CostCandidateDeriver = {
      id: 'EmptySource',
      sourceCardId: '',
      derive: () => [],
    }

    expect(() =>
      deriveCostCandidates([candidate({ wood: 1 })], [first, second], context),
    ).toThrow(/candidateDeriver.*Duplicate.*duplicate/)

    expect(() =>
      deriveCostCandidates([candidate({ wood: 1 })], [emptySource], context),
    ).toThrow(/candidateDeriver.*EmptySource.*empty sourceCardId/)
  })

  it('throws when target card types are empty', () => {
    const deriver: CostCandidateDeriver = {
      id: 'Deriver',
      sourceCardId: 'Deriver',
      derive: () => [],
    }

    expect(() =>
      deriveCostCandidates(
        [candidate({ wood: 1 })],
        [deriver],
        { ...context, targetCardTypes: [] },
      ),
    ).toThrow(/candidateDeriver.*targetCardId=Major_Basket.*empty targetCardTypes/)
  })

  it('does not mark an inapplicable deriver as applied for later derived branches', () => {
    const needsWood: CostCandidateDeriver = {
      id: 'NeedsWood',
      sourceCardId: 'NeedsWood',
      derive(current) {
        return (current.cost.wood ?? 0) > 0
          ? [{ cost: { ...current.cost, food: 1 } }]
          : []
      },
    }
    const createsWood: CostCandidateDeriver = {
      id: 'CreatesWood',
      sourceCardId: 'CreatesWood',
      derive(current) {
        return [{ cost: { ...current.cost, wood: 1 } }]
      },
    }

    expect(
      deriveCostCandidates([candidate({ clay: 1 })], [needsWood, createsWood], context)
        .map(({ cost }) => cost),
    ).toContainEqual({ clay: 1, wood: 1, food: 1 })
  })

  it('unions provenance when different DFS orders hit the same visited identity', () => {
    const addFood: CostCandidateDeriver = {
      id: 'AddFood',
      sourceCardId: 'AddFood',
      derive(current) {
        return [{ cost: { ...current.cost, food: 1 } }]
      },
    }
    const addClay: CostCandidateDeriver = {
      id: 'AddClay',
      sourceCardId: 'AddClay',
      derive(current) {
        return [{ cost: { ...current.cost, clay: 1 } }]
      },
    }

    const result = deriveCostCandidates(
      [candidate({ wood: 1 })],
      [addFood, addClay],
      context,
    )

    expect(result.filter((entry) =>
      entry.cost.wood === 1 && entry.cost.food === 1 && entry.cost.clay === 1,
    )).toEqual([
      expect.objectContaining({
        metadata: { sourceCards: ['AddFood', 'AddClay'] },
      }),
    ])
  })

  it('keeps fee identity in visited keys but removes it from final duplicate keys', () => {
    const addFood: CostCandidateDeriver = {
      id: 'AddFood',
      sourceCardId: 'AddFood',
      derive(current) {
        return [{ cost: { ...current.cost, food: 1 } }]
      },
    }

    const result = deriveCostCandidates(
      [
        candidate({ wood: 1 }, { feeIndex: 0, metadata: { sourceCards: ['base-0'] } }),
        candidate({ wood: 1 }, { feeIndex: 1, metadata: { sourceCards: ['base-1'] } }),
      ],
      [addFood],
      context,
    )

    expect(result.filter((entry) =>
      entry.cost.wood === 1 && entry.cost.food === 1,
    )).toEqual([
      expect.objectContaining({
        feeIndex: 0,
        metadata: { sourceCards: ['base-0', 'AddFood', 'base-1'] },
      }),
    ])
  })

  it('applies direct cost deltas before derivation and clamps them to zero', () => {
    const expanded = expandCostCandidates({ fees: [{ stone: 1 }, { wood: 1 }] })
    const adjusted = applyCostDeltasToCandidates(expanded, [
      { stone: -99 },
      { clay: 1 },
    ])

    expect(adjusted.map(signature)).toEqual([
      { cost: { clay: 1 }, sources: [], feeIndex: 0 },
      { cost: { wood: 1, clay: 1 }, sources: [], feeIndex: 1 },
    ])
  })

  it('applies direct cost deltas in order and clamps after each step', () => {
    const [adjusted] = applyCostDeltasToCandidates(
      [candidate({ wood: 1 })],
      [{ wood: -99 }, { wood: 1 }],
    )

    expect(signature(adjusted!)).toEqual({
      cost: { wood: 1 },
      sources: [],
      feeIndex: undefined,
    })
  })

  it('does not remove dominated candidates during candidate derivation', () => {
    const freeWood: CostCandidateDeriver = {
      id: 'FreeWood',
      sourceCardId: 'FreeWood',
      derive: () => [{ cost: {} }],
    }

    expect(
      deriveCostCandidates([candidate({ wood: 1 })], [freeWood], context)
        .map(signature),
    ).toEqual([
      { cost: { wood: 1 }, sources: [], feeIndex: undefined },
      { cost: {}, sources: ['FreeWood'], feeIndex: undefined },
    ])
  })

  it('expands flat, fee, and fees costs into normalized candidates', () => {
    expect(expandCostCandidates({ wood: 0, clay: 2 })).toEqual([
      candidate({ clay: 2 }),
    ])

    expect(expandCostCandidates({ fee: { wood: 1 } } satisfies ComplexCost)).toEqual([
      candidate({ wood: 1 }),
    ])

    expect(expandCostCandidates({ fees: [{ wood: 1 }, { clay: 1 }] })).toEqual([
      candidate({ wood: 1 }, { feeIndex: 0 }),
      candidate({ clay: 1 }, { feeIndex: 1 }),
    ])

    expect(expandCostCandidates({
      fees: [{ wood: 1 }, { food: 1 }],
      costCandidateSourceCards: [[], ['D117_WoodExpert']],
    })).toEqual([
      candidate({ wood: 1 }, { feeIndex: 0 }),
      candidate({ food: 1 }, {
        feeIndex: 1,
        metadata: { sourceCards: ['D117_WoodExpert'] },
      }),
    ])
  })
})
