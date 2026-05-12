import { MinorImprovement } from '../types'

const CARD_ID = 'E34_LandRegister'

export const E34_LandRegister = new MinorImprovement({
  id: CARD_ID,
  name: "Land Register",
  deck: "E",
  number: 34,
  category: "BONUS_POINTS_-_GET",
  desc: ['During scoring, if your farm has no unused spaces, you get 2 bonus <SCORE>.'],
  cost: { wood: 1 },
  vp: 0,
  extraVp: true,
})
