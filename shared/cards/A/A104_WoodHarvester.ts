import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'A104_WoodHarvester'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onHarvestFieldPhase: (state, _player) => {

    // Count wood on each accumulation space
    let wood2Count = 0
    let wood3plusCount = 0

    for (const space of state.actionSpaces) {
      if ((space.gainPerRound.wood ?? 0) <= 0) continue
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

export const A104_WoodHarvester = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Wood Harvester",
    deck: "A",
    number: 104,
    category: "GOODS_PROVIDER",
    desc: ["In the field phase of each harvest, you get 1 <WOOD>/1 <FOOD> for each <WOOD> accumulation space with exactly 2 <WOOD>/at least 3 <WOOD>."],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const A104_WoodHarvester_impl = A104_WoodHarvester.impl
