import { Occupation } from '../types'

const CARD_ID = 'D114_SeedTrader'

export const D114_SeedTrader = new Occupation({
  id: CARD_ID,
  name: 'Seed Trader',
  deck: 'D',
  number: 114,
  category: 'CROP_PROVIDER',
  desc: [
    'Place 2 <GRAIN> and 2 <VEGETABLE> on this card. You can buy them at any time. Each <GRAIN> costs 2 <FOOD>; each <VEGETABLE> costs 3 <FOOD>.',
  ],
  cost: {},
  players: '1+',
})
