import { MinorImprovement } from '../types'

const CARD_ID = 'D83_Pigswill'

export const D83_Pigswill = new MinorImprovement({
  id: CARD_ID,
  name: 'Pigswill',
  deck: 'D',
  number: 83,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Each time you use the __Fencing__ action space, you also get 1 <PIG>.'],
  altCosts: [{ food: 2 }, { grain: 1 }],
})
