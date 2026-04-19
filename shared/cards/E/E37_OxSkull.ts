import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E37_OxSkull'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    return player.resources.cattle === 0 ? 3 : 0
  },
})

export const E37_OxSkull = new MinorImprovement({
  id: CARD_ID,
  name: "Ox Skull",
  deck: "E",
  number: 37,
  category: "POINTS_PROVIDER",
  desc: ['During scoring, if you have no <CATTLE>, you get 3 bonus <SCORE>.'],
  cost: {},
  prerequisite: "1 Cattle",
  vp: 0,
})
