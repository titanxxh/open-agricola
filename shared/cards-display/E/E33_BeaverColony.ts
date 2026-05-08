import { MinorImprovement } from '../types'

const CARD_ID = 'E33_BeaverColony'

export const E33_BeaverColony = new MinorImprovement({
  id: CARD_ID,
  name: "Beaver Colony",
  deck: "E",
  number: 33,
  category: "BONUS_POINTS_-_GET",
  desc: ['From now on, one of your pastures with stable cannot hold animals. Each time you get <REED> from an action space, you get 1\u00a0bonus <SCORE>.'],
  vp: 1,
  cost: {},
  prerequisite: "1 Fenced Stable",
})
