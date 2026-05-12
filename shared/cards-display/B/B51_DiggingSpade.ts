import { MinorImprovement } from '../types'

const CARD_ID = 'B51_DiggingSpade'

export const B51_DiggingSpade = new MinorImprovement({
  id: CARD_ID,
  name: 'Digging Spade',
  deck: 'B',
  number: 51,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time you use a clay accumulation space, you also get a number of <FOOD> equal to the number of <PIG> in your farmyard.',
  ],
  cost: { wood: 1 },
  prerequisite: 'Play in Round 7 or Later',
})
