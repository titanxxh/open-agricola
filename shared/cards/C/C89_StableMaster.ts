import { Occupation } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C89_StableMaster'

export const C89_StableMaster = new Occupation({
  id: CARD_ID,
  name: 'Stable Master',
  deck: 'C',
  number: 89,
  category: 'FARM_PLANNER',
  desc: ['When you play this card, you can immediately build exactly 1 stable for 1 <WOOD>. Exactly one of your unfenced stables can hold up to 3 animals of one type.'],
  cost: {},
  players: '1+',
})

export const C89_StableMaster_impl = {
  effect: {
    id: CARD_ID,
    /**
     * BGA onBuy: optional STABLES action with max=1, costs={WOOD:1} (default
     * stable cost is 2 wood, so override -1). Skipped automatically when no
     * reserve stable / wood is available — engine resolves into a no-op.
     */
    onBuy: (_state, player) => {
      if (player.stableTiles.length >= 4) return
      if ((player.resources.wood ?? 0) < 1) return
      return {
        type: 'leaf',
        actionId: 'stables',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { max: 1, costOverride: { wood: -1 }, trueAction: false },
      }
    },
    onComputeAnimalZones: (_player, zones) => {
      const stableZone = zones.find(z => z.zoneType === 'stable')
      if (stableZone) {
        stableZone.capacity += 2 // 1 → 3
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
