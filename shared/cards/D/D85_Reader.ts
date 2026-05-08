import type { CardImpl } from '../registry'
import { D85_Reader } from '../../cards-display/D/D85_Reader'
export { D85_Reader }

const CARD_ID = D85_Reader.id

export const D85_Reader_impl = {
  effect: {
  id: CARD_ID,
  computeExtraRoomCapacity: (player) => {
    return player.occupationPlayed.length >= 6 ? 1 : 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
