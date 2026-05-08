import { Occupation } from '../types'

const CARD_ID = 'D163_JourneymanBricklayer'

export const D163_JourneymanBricklayer = new Occupation({
  id: CARD_ID,
  name: 'Journeyman Bricklayer',
  deck: 'D',
  number: 163,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'When you play this card, you immediately get 2 <STONE>. Each time another player renovates to stone or builds a stone room, you get 1 <STONE>.',
  ],
  cost: {},
  players: '4+',
})
