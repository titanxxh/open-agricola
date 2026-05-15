import type { CardImpl } from '../registry'
import { C89_StableMaster } from '../../cards-display/C/C89_StableMaster'

const CARD_ID = C89_StableMaster.id

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
    onComputeAnimalZones: (_player, zones, _state) => {
      const stableZone = zones.find(z => z.zoneType === 'stable')
      if (stableZone) {
        stableZone.capacity += 2 // 1 → 3
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
