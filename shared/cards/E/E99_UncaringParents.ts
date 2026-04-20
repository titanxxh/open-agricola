import { Occupation } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E99_UncaringParents'

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

export const E99_UncaringParents_impl = {
  effect: {
  id: CARD_ID,
  onEndHarvest: (_state, player) => {
    if (player.houseType !== 'stone') return

    return {
      type: 'leaf',
      actionId: 'bonus-vp',
      sourceCard: CARD_ID,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
