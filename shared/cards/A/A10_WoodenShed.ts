import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'
import { A10_WoodenShed } from '../../cards-display/A/A10_WoodenShed'
export { A10_WoodenShed }

const CARD_ID = A10_WoodenShed.id

registerPrerequisite('Still in Wooden House', (player) => player.houseType === 'wood')

export const A10_WoodenShed_impl = {
  effect: {
  id: CARD_ID,
  computeExtraRoomCapacity: () => 1,
},
  reaches: [] as readonly string[],
} satisfies CardImpl
