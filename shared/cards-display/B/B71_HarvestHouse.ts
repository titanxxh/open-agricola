import { MinorImprovement } from '../types'

const CARD_ID = 'B71_HarvestHouse'

export const B71_HarvestHouse = new MinorImprovement({
  id: CARD_ID,
  name: 'Harvest House',
  deck: 'B',
  number: 71,
  category: 'CROP_PROVIDER',
  desc: ['When you play this card, if the number of completed harvests is equal to the number of occupations you played, you immediately get 1 <FOOD>, 1 <GRAIN>, and 1 <VEGETABLE>.'],
  cost: { wood: 1, clay: 1, reed: 1 },
  vp: 2,
})
