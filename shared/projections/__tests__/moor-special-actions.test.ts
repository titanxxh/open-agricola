import { describe, expect, it } from 'vitest'
import type { MoorSpecialActionId } from '../../moor/types'
import {
  isMoorTerrainAction,
  moorSpecialActionBoughtImprovement,
  moorSpecialActionBuysImprovement,
  moorSpecialActionEffectGroups,
  moorSpecialActionRemovedTerrain,
} from '../moor-special-actions'

const ALL_ACTIONS: MoorSpecialActionId[] = [
  'cut-peat', 'fell-trees', 'slash-and-burn', 'horse-market', 'hiring-fair', 'black-market', 'illicit-work',
]

describe('moor special action shapes', () => {
  it('names the terrain the three terrain actions remove and nothing for the rest', () => {
    expect(ALL_ACTIONS.map(moorSpecialActionRemovedTerrain)).toEqual(['moor', 'forest', 'forest', null, null, null, null])
    expect(ALL_ACTIONS.filter(isMoorTerrainAction)).toEqual(['cut-peat', 'fell-trees', 'slash-and-burn'])
  })

  it('names the improvement black market and illicit work buy and nothing for the rest', () => {
    expect(ALL_ACTIONS.map(moorSpecialActionBoughtImprovement)).toEqual([null, null, null, null, null, 'minor', 'major'])
    expect(ALL_ACTIONS.filter(moorSpecialActionBuysImprovement)).toEqual(['black-market', 'illicit-work'])
  })
})

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
