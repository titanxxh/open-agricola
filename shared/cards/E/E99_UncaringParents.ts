import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E99_UncaringParents'

registerCardEffect({
  id: CARD_ID,
  onEndHarvest: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    if (player.houseType !== 'stone') return

    return {
      type: 'leaf',
      actionId: 'bonus-vp',
      sourceCard: CARD_ID,
    }
  },
})

export const E99_UncaringParents = new Occupation({
  id: CARD_ID,
  name: "Uncaring Parents",
  deck: "E",
  number: 99,
  category: "POINTS_PROVIDER",
  desc: ["At the end of each harvest, if you live in a stone house, you get 1 bonus <SCORE>."],
  cost: {},
  players: "1+",
})
