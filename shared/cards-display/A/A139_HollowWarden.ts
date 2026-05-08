import { Occupation } from '../types'

const CARD_ID = 'A139_HollowWarden'

export const A139_HollowWarden = new Occupation({
  id: CARD_ID,
  name: 'Hollow Warden',
  deck: 'A',
  number: 139,
  category: 'FOOD_PROVIDER',
  desc: [
    'When you play this card, you immediately get a __Major Improvement__ action to build a Fireplace. Each time you use the __Hollow__ accumulation space, you also get 1 <FOOD>.',
  ],
  cost: {},
  players: '3+',
  newSet: true,
})
