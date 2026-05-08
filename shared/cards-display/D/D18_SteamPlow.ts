import { MinorImprovement } from '../types'

const CARD_ID = 'D18_SteamPlow'

export const D18_SteamPlow = new MinorImprovement({
  id: CARD_ID,
  name: 'Steam Plow',
  deck: 'D',
  number: 18,
  category: 'FARM_PLANNER',
  desc: ['Immediately after each returning home phase, you can pay 2 <WOOD> and 1 <FOOD> to use the __Farmland__ action space without placing a person.'],
  cost: { wood: 1, food: 1 },
  vp: 1,
  newSet: true,
})
