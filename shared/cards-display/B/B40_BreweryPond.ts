import { MinorImprovement } from '../types'

const CARD_ID = 'B40_BreweryPond'

export const B40_BreweryPond = new MinorImprovement({
  id: CARD_ID,
  name: 'Brewery Pond',
  deck: 'B',
  number: 40,
  category: 'GOODS_PROVIDER',
  desc: ['Each time you use the __Fishing__ or __Reed Bank__ accumulation space, you also get 1 <GRAIN> and 1 <WOOD>.'],
  vp: -1,
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  newSet: true,
})
