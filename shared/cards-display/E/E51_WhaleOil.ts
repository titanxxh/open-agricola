import { MinorImprovement } from '../types'

const CARD_ID = 'E51_WhaleOil'

export const E51_WhaleOil = new MinorImprovement({
  id: CARD_ID,
  name: 'Whale Oil',
  deck: 'E',
  number: 51,
  category: 'FOOD',
  desc: ['Each time you use __Fishing__, place 1 <FOOD> from the general supply on this card. Each time before you play an occupation, you get <FOOD> equal to the amount on this card.'],
  cost: { wood: 1 },
})
