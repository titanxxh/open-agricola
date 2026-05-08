import type { CardImpl } from '../registry'
import { A104_WoodHarvester } from '../../cards-display/A/A104_WoodHarvester'
export { A104_WoodHarvester }

const CARD_ID = A104_WoodHarvester.id

export const A104_WoodHarvester_impl = {
  effect: {
  id: CARD_ID,
  onHarvestFieldPhase: (state, _player) => {

    // Count wood on each accumulation space
    let wood2Count = 0
    let wood3plusCount = 0

    for (const space of state.actionSpaces) {
      const woodAccum = space.resources.wood ?? 0
      if (woodAccum === 2) wood2Count += 1
      else if (woodAccum >= 3) wood3plusCount += 1
    }

    const gainResources: Record<string, number> = {}
    if (wood2Count > 0) gainResources.wood = wood2Count
    if (wood3plusCount > 0) gainResources.food = wood3plusCount

    if (Object.keys(gainResources).length === 0) return

    return {
      type: 'leaf',
      actionId: 'gain',
      params: gainResources,
      sourceCard: CARD_ID,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
