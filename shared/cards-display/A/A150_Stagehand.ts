import { Occupation } from '../types'

const CARD_ID = 'A150_Stagehand'

export const A150_Stagehand = new Occupation({
  id: CARD_ID,
  name: 'Stagehand',
  deck: 'A',
  number: 150,
  category: 'ACTIONS_BOOSTER',
  desc: ['Each time another player uses the __Traveling Players__ accumulation space, you can take your choice of a __Build Fences__, __Build Stables__, or __Build Rooms__ action.'],
  cost: {},
  players: '4+',
})
