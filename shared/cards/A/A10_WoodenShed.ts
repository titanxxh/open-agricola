import type { CardImpl } from '../registry'
import { A10_WoodenShed } from '../../cards-display/A/A10_WoodenShed'

const CARD_ID = A10_WoodenShed.id

export const A10_WoodenShed_impl = {
  effect: {
  id: CARD_ID,
  computeExtraRoomCapacity: () => 1,
},
  prerequisiteCheck: (player) => player.houseType === 'wood',
  reaches: [] as readonly string[],
} satisfies CardImpl
