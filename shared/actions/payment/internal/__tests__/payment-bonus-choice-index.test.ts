import { describe, it, expect } from 'vitest'
import { computeAllBuyableCombinations } from '../enumerate'
import type { PlayerState, ComplexCost } from '../../../../contract/types'

const mkPlayer = (resources: Partial<PlayerState['resources']>): PlayerState =>
  ({
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
  }) as unknown as PlayerState

describe('computeAllBuyableCombinations: bonusChoiceIndex', () => {
  it('records choiceIndex per multi-choice candidate', () => {
    const player = mkPlayer({ wood: 5, clay: 5 })
    const cost: ComplexCost = {
      fee: { wood: 2, clay: 2 },
      bonuses: [
        {
          sources: ['TEST_CARD'],
          choices: [
            { discount: { wood: -1 } },
            { discount: { clay: -1 } },
          ],
          optional: false,
        },
      ],
    }
    const sols = computeAllBuyableCombinations(player, cost)
    expect(sols.length).toBe(2)
    const indices = sols.map((s) => s.bonusChoiceIndex?.['TEST_CARD']).sort()
    expect(indices).toEqual([0, 1])
  })

  it('omits bonusChoiceIndex for choice-less bonus', () => {
    const player = mkPlayer({ wood: 5 })
    const cost: ComplexCost = {
      fee: { wood: 2 },
      bonuses: [
        { sources: ['SIMPLE_CARD'], discount: { wood: -1 }, optional: false },
      ],
    }
    const sols = computeAllBuyableCombinations(player, cost)
    expect(sols.length).toBe(1)
    expect(sols[0]!.bonusChoiceIndex).toBeUndefined()
  })
})

describe('hashSolution dedupe with bonusChoiceIndex', () => {
  it('different choiceIndex produces distinct solutions', () => {
    const player = mkPlayer({ wood: 5, clay: 5 })
    // Two candidates with same discount shape — must remain distinct via choiceIndex.
    const cost: ComplexCost = {
      fee: { wood: 2 },
      bonuses: [
        {
          sources: ['CARD_A'],
          choices: [
            { discount: { wood: -1 } },
            { discount: { wood: -1 } },
          ],
          optional: false,
        },
      ],
    }
    const sols = computeAllBuyableCombinations(player, cost)
    expect(sols.length).toBe(2)
    const indices = sols
      .map((s) => s.bonusChoiceIndex?.['CARD_A'])
      .sort()
    expect(indices).toEqual([0, 1])
  })
})
