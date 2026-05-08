import { Occupation } from '../types'

const CARD_ID = 'D109_SowingMaster'

export const D109_SowingMaster = new Occupation({
  id: CARD_ID,
  name: 'Sowing Master',
  deck: 'D',
  number: 109,
  category: 'FOOD_PROVIDER',
  desc: [
    'When you play this card, you immediately get 1 <WOOD>. Each time after you use the __Grain Utilization__ or __Cultivation__ action space, you get 2 <FOOD>.',
  ],
  cost: {},
  players: '1+',
  evenMoreSet: true,
  implemented: true,
})
