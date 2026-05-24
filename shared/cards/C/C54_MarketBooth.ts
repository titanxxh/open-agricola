import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C54_MarketBooth } from '../../cards-display/C/C54_MarketBooth'

const CARD_ID = C54_MarketBooth.id

export const C54_MarketBooth_impl = {
  effect: {
    id: CARD_ID,
    onEndHarvestFieldPhase: () => payGainNode({
      cardId: CARD_ID,
      cost: { grain: 1, fence: 1 },
      gain: { food: 5 },
    }).flow,
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
