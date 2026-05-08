import { MinorImprovement } from '../types'

const CARD_ID = 'C9_AutomaticWaterTrough'

export const C9_AutomaticWaterTrough = new MinorImprovement({
  id: CARD_ID,
  name: 'Automatic Water Trough',
  deck: 'C',
  number: 9,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['If you can accommodate the animal, you can immediately buy 1 <SHEEP>/<PIG>/<CATTLE> for 0/1/2 <FOOD>.'],
  cost: { wood: 1 },
  newSet: true,
})
