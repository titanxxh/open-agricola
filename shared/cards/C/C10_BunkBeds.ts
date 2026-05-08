import type { CardImpl } from '../registry'
import { C10_BunkBeds } from '../../cards-display/C/C10_BunkBeds'
export { C10_BunkBeds }

const CARD_ID = C10_BunkBeds.id

export const C10_BunkBeds_impl = {
  effect: {
  id: CARD_ID,
  computeExtraRoomCapacity: (player) => {
    return player.rooms >= 4 ? 1 : 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
