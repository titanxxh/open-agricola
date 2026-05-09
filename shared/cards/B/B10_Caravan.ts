import type { CardImpl } from '../registry'
import { B10_Caravan } from '../../cards-display/B/B10_Caravan'

const CARD_ID = B10_Caravan.id

export const B10_Caravan_impl = {
  effect: {
    id: CARD_ID,
    computeExtraRoomCapacity: (player) =>
      player.minorPlayed.includes(CARD_ID) ? 1 : 0,
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
