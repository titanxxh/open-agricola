import { describe, expect, it } from 'vitest'
import { moorSpecialActionEffectGroups } from '../moor-special-actions'

describe('moor special action effect groups', () => {
  it('keeps every player count of a card together when the printed effect is the same', () => {
    expect(moorSpecialActionEffectGroups('cut-peat', [1, 2])).toEqual([
      { playerCounts: [1, 2], params: { fuel: 3, foodCost: 0, fuelCost: 0 } },
    ])
  })

  it('splits player counts whose printed values differ, in the order the card lists them', () => {
    expect(moorSpecialActionEffectGroups('horse-market', [1, 5, 6])).toEqual([
      { playerCounts: [1], params: { horse: 1, foodCost: 0, fuelCost: 0 } },
      { playerCounts: [5, 6], params: { horse: 1, foodCost: 1, fuelCost: 0 } },
    ])
    expect(moorSpecialActionEffectGroups('hiring-fair', [1, 3])).toEqual([
      { playerCounts: [1], params: { food: 1, foodCost: 0, fuelCost: 0 } },
      { playerCounts: [3], params: { food: 2, foodCost: 0, fuelCost: 0 } },
    ])
  })
})
