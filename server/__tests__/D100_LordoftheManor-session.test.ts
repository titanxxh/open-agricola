import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../shared/contract/types'
import type { ScoreCategoryResult } from '../../shared/domain/scoring'
import { D100_LordoftheManor_impl } from '../../shared/cards/D/D100_LordoftheManor'

const makeCategory = (key: ScoreCategoryResult['key'], total: number): ScoreCategoryResult => ({
  key,
  total,
  quantity: total,
  entries: [{ type: 'quantity', quantity: total, score: total }],
})

describe('D100_LordoftheManor scoring bonus', () => {
  const compute = D100_LordoftheManor_impl.effect.computeBonusScore
  const dummyState = {} as GameState
  const dummyPlayer = {} as PlayerState

  it('awards +1 per standard category that maxes at 4', () => {
    const categories: ScoreCategoryResult[] = [
      makeCategory('fields', 4),
      makeCategory('pastures', 4),
      makeCategory('grains', 4),
      makeCategory('vegetables', 3),
    ]
    expect(compute(dummyState, dummyPlayer, { categories })).toBe(3)
  })

  it('counts 4 fenced stables as a maxed category (BGA: stables in whitelist)', () => {
    const categories: ScoreCategoryResult[] = [
      makeCategory('stables', 4),
      makeCategory('fields', 1),
    ]
    expect(compute(dummyState, dummyPlayer, { categories })).toBe(1)
  })

  it('does not count 3 fenced stables', () => {
    const categories: ScoreCategoryResult[] = [makeCategory('stables', 3)]
    expect(compute(dummyState, dummyPlayer, { categories })).toBe(0)
  })

  it('counts fenced stables alongside other maxed categories', () => {
    const categories: ScoreCategoryResult[] = [
      makeCategory('fields', 5),
      makeCategory('stables', 5),
      makeCategory('grains', 4),
    ]
    expect(compute(dummyState, dummyPlayer, { categories })).toBe(3)
  })

  it('ignores non-standard categories (clayRooms / stoneRooms / empty / cards)', () => {
    const categories: ScoreCategoryResult[] = [
      makeCategory('clayRooms', 4),
      makeCategory('empty', 4),
    ]
    expect(compute(dummyState, dummyPlayer, { categories })).toBe(0)
  })
})
