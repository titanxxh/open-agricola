import { describe, expect, it } from 'vitest'
import { getMinorImprovementCard } from '../catalog'

// BGA reference: bga-agricola/modules/php/Cards/<deck>/<id>.php $this->costs = [[X],[Y]]
// Locked in by 2026-05-12 metadata-3b real-deviation fix (P0 gameplay).
const cases: Array<{ id: string; altCosts: Record<string, number>[] }> = [
  { id: 'B48_ForestStone', altCosts: [{ wood: 2 }, { stone: 1 }] },
  { id: 'C40_CanvasSack', altCosts: [{ grain: 1 }, { reed: 1 }] },
  { id: 'C44_ChickenCoop', altCosts: [{ clay: 2 }, { wood: 2 }] },
  { id: 'D80_BrickHammer', altCosts: [{ wood: 1 }, { food: 1 }] },
  { id: 'E30_ChildsToy', altCosts: [{ wood: 1 }, { clay: 1 }] },
  { id: 'E52_Cubbyhole', altCosts: [{ wood: 1 }, { clay: 1 }] },
]

describe('altCosts BGA alignment (P0 gameplay)', () => {
  it.each(cases)(
    '$id has altCosts matching BGA',
    ({ id, altCosts }) => {
      const card = getMinorImprovementCard(id)
      expect(card, `card not found in catalog: ${id}`).toBeDefined()
      expect(card!.altCosts).toEqual(altCosts)
    },
  )
})
