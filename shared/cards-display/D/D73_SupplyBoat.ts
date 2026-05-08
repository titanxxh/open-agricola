import { MinorImprovement } from '../types'

const CARD_ID = 'D73_SupplyBoat'

export const D73_SupplyBoat = new MinorImprovement({
  id: CARD_ID,
  name: 'Supply Boat',
  deck: 'D',
  number: 73,
  category: 'CROP_PROVIDER',
  desc: [
    'Each time after you use the __Fishing__ accumulation space, you can choose to buy 1 <GRAIN> for 1 <FOOD>, or 1 <VEGETABLE> for 3 <FOOD>.',
  ],
  cost: { wood: 1 },
  vp: 1,
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
})
