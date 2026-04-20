import { Occupation } from '../types'
import { writeCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'C108_Layabout'

export const C108_Layabout = new Occupation({
  id: CARD_ID,
  name: "Layabout",
  deck: "C",
  number: 108,
  category: "FOOD_PROVIDER",
  desc: ["When you play this card, you must skip the next harvest. (You also do not have to feed your family that harvest.)"],
  players: "1+",
})

export const C108_Layabout_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    writeCardExtraData(player, CARD_ID, 'skipNextHarvest', true)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
