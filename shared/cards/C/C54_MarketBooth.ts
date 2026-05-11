import { getFenceCount } from '../../actions/effects/fencing'
import type { CardImpl } from '../registry'
import { C54_MarketBooth } from '../../cards-display/C/C54_MarketBooth'

const CARD_ID = C54_MarketBooth.id

export const C54_MarketBooth_impl = {
  prerequisiteCheck: (player) => player.stableTiles.length < 4,
  effect: {
    id: CARD_ID,
    onEndHarvestFieldPhase: (_state, player) => {
      if (player.resources.grain < 1) return
      if (getFenceCount(player) === 0) return

      return {
        type: 'seq',
        optional: true,
        children: [
          { type: 'leaf', actionId: 'pay', params: { grain: 1 }, sourceCard: CARD_ID },
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'consume-fence', count: 1 },
          },
          { type: 'leaf', actionId: 'gain', params: { food: 5 }, sourceCard: CARD_ID },
        ],
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
