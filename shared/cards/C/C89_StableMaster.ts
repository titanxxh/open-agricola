import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'
import { getAvailableStableSupplyCount } from '../../domain/supply-tokens'

const CARD_ID = 'C89_StableMaster'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      if (getAvailableStableSupplyCount(state, player) <= 0) return
      return {
        type: 'leaf',
        actionId: 'stables',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { max: 1, exactCost: { wood: 1 }, trueAction: false },
      }
    },
    onComputeAnimalZones: (_player, zones, _state) => {
      const stableZone = zones.find(z => z.zoneType === 'stable')
      if (stableZone) {
        stableZone.capacity += 2 // 1 → 3
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C89_StableMaster = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Stable Master',
    deck: 'C',
    number: 89,
    category: 'FARM_PLANNER',
    desc: ['When you play this card, you can immediately build exactly 1 stable for 1 <WOOD>. Exactly one of your unfenced stables can hold up to 3 animals of one type.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const C89_StableMaster_impl = C89_StableMaster.impl
