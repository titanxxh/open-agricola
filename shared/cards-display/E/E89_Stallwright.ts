import { Occupation } from '../types'

const CARD_ID = 'E89_Stallwright'

export const E89_Stallwright = new Occupation({
  id: CARD_ID,
  name: 'Stallwright',
  deck: 'E',
  number: 89,
  category: 'FARMYARD_-_STABLE_BUILDING',
  desc: [
    'After you play your 2nd, 3rd, 5th, and 7th occupation (including this one), you can build 1 stable at no cost.',
  ],
  cost: {},
  players: '1+',
})
