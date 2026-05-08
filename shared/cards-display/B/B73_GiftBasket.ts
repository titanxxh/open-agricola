import { MinorImprovement } from '../types'

const CARD_ID = 'B73_GiftBasket'

export const B73_GiftBasket = new MinorImprovement({
  id: CARD_ID,
  name: 'Gift Basket',
  deck: 'B',
  number: 73,
  category: 'CROP_PROVIDER',
  desc: ['When you play this card, if you have exactly 2/3/4/5 rooms, you immediately get 1 <VEGETABLE>/<FOOD>/<GRAIN>/<VEGETABLE>.'],
  cost: { reed: 1 },
  vp: 1,
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})
