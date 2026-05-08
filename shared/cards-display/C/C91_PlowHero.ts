import { Occupation } from '../types'

const CARD_ID = 'C91_PlowHero'

export const C91_PlowHero = new Occupation({
  id: CARD_ID,
  name: 'Plow Hero',
  deck: 'C',
  number: 91,
  category: 'FARM_PLANNER',
  desc: ['Each time you use the __Farmland__ or __Cultivation__ action space with the first person you place in a round, you can plow 1 additional field for 1 <FOOD>.'],
  cost: {},
  players: '1+',
  newSet: true,
})
