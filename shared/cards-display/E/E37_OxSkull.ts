import { MinorImprovement } from '../types'

const CARD_ID = 'E37_OxSkull'

export const E37_OxSkull = new MinorImprovement({
  id: CARD_ID,
  name: "Ox Skull",
  deck: "E",
  number: 37,
  category: "BONUS_POINTS_-_GET",
  desc: ['During scoring, if you have no <CATTLE>, you get 3 bonus <SCORE>.'],
  cost: {},
  prerequisite: "1 Cattle",
  vp: 0,
})
