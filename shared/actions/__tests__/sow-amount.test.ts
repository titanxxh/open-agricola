import { describe, expect, it } from 'vitest'
import { finalSowAmount, optionalSowAmountSources, type SowAmountPlan } from '../helpers/sow-amount'

const plan = (overrides: Partial<SowAmountPlan> = {}): SowAmountPlan => ({
  key: '0-2',
  target: { kind: 'farmyard', row: 0, col: 2 },
  crop: 'grain',
  base: 3,
  fixedDelta: 0,
  fixedSources: [],
  optional: [],
  ...overrides,
})

describe('Sow amount modifier arithmetic', () => {
  it('keeps the base amount without modifiers', () => {
    expect(finalSowAmount(plan())).toBe(3)
    expect(finalSowAmount(plan({ crop: 'vegetable', base: 2 }))).toBe(2)
  })

  it('sums fixed and chosen optional deltas regardless of source order', () => {
    const optional = [{ cardId: 'A', delta: 2 }, { cardId: 'B', delta: -1 }]
    const chosen = { A: ['0-2'], B: ['0-2'] }
    expect(finalSowAmount(plan({ fixedDelta: -1, optional }), chosen)).toBe(3)
    expect(finalSowAmount(plan({ fixedDelta: -1, optional: [...optional].reverse() }), chosen)).toBe(3)
  })

  it('ignores optional deltas the player did not choose for this target', () => {
    const optional = [{ cardId: 'A', delta: 1 }]
    expect(finalSowAmount(plan({ optional }), { A: ['1-2'] })).toBe(3)
    expect(finalSowAmount(plan({ optional }), {})).toBe(3)
  })

  it('never goes below the seed itself', () => {
    expect(finalSowAmount(plan({ crop: 'vegetable', base: 2, fixedDelta: -2 }))).toBe(1)
  })

  it('lists each optional source once with all targets it may improve, in plan order', () => {
    const plans = [
      plan({ key: '0-2', optional: [{ cardId: 'E', delta: 1 }, { cardId: 'B', delta: 1 }] }),
      plan({ key: '1-2', optional: [{ cardId: 'B', delta: 1 }] }),
    ]
    expect(optionalSowAmountSources(plans)).toEqual([
      { cardId: 'E', keys: ['0-2'] },
      { cardId: 'B', keys: ['0-2', '1-2'] },
    ])
  })
})
