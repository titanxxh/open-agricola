import { Occupation } from '../types'

const CARD_ID = 'B160_PubOwner'

export const B160_PubOwner = new Occupation({
  id: CARD_ID,
  name: 'Pub Owner',
  deck: 'B',
  number: 160,
  category: 'CROP_PROVIDER',
  desc: [
    'When you play this card and at the end of each work phase in which the __Forest__, __Clay Pit__, and __Reed Bank__ accumulation spaces are all occupied, you get 1 <GRAIN>.',
  ],
  cost: {},
  players: '4+',
})
