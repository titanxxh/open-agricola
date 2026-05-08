import { Occupation } from '../types'

const CARD_ID = 'D113_FoodMerchant'

export const D113_FoodMerchant = new Occupation({
  id: CARD_ID,
  name: 'Food Merchant',
  deck: 'D',
  number: 113,
  category: 'CROP_PROVIDER',
  desc: [
    'For each <GRAIN> you harvest from a field, you can buy 1 <VEGETABLE> for 3 <FOOD>. If you harvest the last <GRAIN> from a field, the <VEGETABLE> costs you only 2 <FOOD>.',
  ],
  cost: {},
  players: '1+',
})
