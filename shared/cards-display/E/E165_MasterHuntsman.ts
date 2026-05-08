import { Occupation } from '../types'

const CARD_ID = 'E165_MasterHuntsman'

export const E165_MasterHuntsman = new Occupation({
  id: CARD_ID,
  name: 'Master Huntsman',
  deck: 'E',
  number: 165,
  category: 'ANIMALS_-_WILD_BOAR',
  desc: [
    'When you play this card and each time you build a major improvement, you get 1 <PIG>.',
  ],
  cost: {},
  players: '4+',
})
