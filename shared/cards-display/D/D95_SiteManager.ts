import { Occupation } from '../types'

const CARD_ID = 'D95_SiteManager'

export const D95_SiteManager = new Occupation({
  id: CARD_ID,
  name: 'Site Manager',
  deck: 'D',
  number: 95,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'When you play this card, immediately build a major improvement. When paying its cost, you can replace up to 1 building resource of each type with 1 <FOOD> each.',
  ],
  cost: {},
  players: '1+',
  evenMoreSet: true,
})
