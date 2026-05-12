import { Occupation } from '../types'

const CARD_ID = 'E160_KelpGatherer'

export const E160_KelpGatherer = new Occupation({
  id: CARD_ID,
  name: 'Kelp Gatherer',
  deck: 'E',
  number: 160,
  category: 'CROPS',
  desc: [
    'Each time another player uses the __Fishing__ accumulation space, they get 1 additional <FOOD> and you get 1 <VEGETABLE>.',
  ],
  cost: {},
  players: '4+',
})
