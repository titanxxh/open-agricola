import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { writeCardExtraData } from '../helpers/card-state'

const CARD_ID = 'C108_Layabout'

// BGA: When played, player must skip the next harvest (including feeding).
// Simplified: store a flag so onStartHarvest can skip the harvest.
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    writeCardExtraData(player, CARD_ID, 'skipNextHarvest', true)
  },
})

export const C108_Layabout = new Occupation({
  id: CARD_ID,
  name: "Layabout",
  deck: "C",
  number: 108,
  category: "FOOD_PROVIDER",
  desc: ["When you play this card, you must skip the next harvest. (You also do not have to feed your family that harvest.)"],
  players: "1+",
})
