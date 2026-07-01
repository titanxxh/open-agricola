import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { getAssignedAnimalsByType } from '../../domain/animals'
import { writeCardExtraData } from '../helpers/card-state'

const CARD_ID = 'M086_SpinningMill'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onHarvestFieldPhase: (state, player) => {
      const sheep = getAssignedAnimalsByType(player, state).sheep
      writeCardExtraData(player, CARD_ID, 'heatingRoomDiscount', Math.floor(sheep / 2))
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M086_SpinningMill = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Spinning Mill",
    deck: "M",
    number: 86,
    category: "GOODS_PROVIDER",
    desc: [
        "For every 2 sheep that you have in the field phase of each harvest, you pay 1 fuel less to heat your house in the feeding phase of that harvest, but not less than 0 fuel."
    ],
    cost: {
        "wood": 2,
        "clay": 2
    },
    vp: 2,
    prerequisite: "1 Sheep",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M086_SpinningMill_impl = M086_SpinningMill.impl
