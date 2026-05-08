import { Occupation } from '../types'

const CARD_ID = 'E116_FirCutter'

export const E116_FirCutter = new Occupation({
  id: CARD_ID,
  name: 'Fir Cutter',
  deck: 'E',
  number: 116,
  category: 'BUILDING_RESOURCES_-_WOOD',
  desc: [
    'When you play this card, you immediately get 1 <FOOD>. Each time after you use an animal accumulation space with your 1st/2nd/3rd/4th/5th person, you get 1/1/2/2/3 <WOOD>.',
  ],
  cost: {},
  players: '1+',
  evenMoreSet: true,
})
