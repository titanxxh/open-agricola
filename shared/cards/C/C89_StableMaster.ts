import type { CardImpl } from '../registry'
import { C89_StableMaster } from '../../cards-display/C/C89_StableMaster'
import { getAvailableStableSupplyCount } from '../../domain/supply-tokens'

const CARD_ID = C89_StableMaster.id

export const C89_StableMaster_impl = {
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
