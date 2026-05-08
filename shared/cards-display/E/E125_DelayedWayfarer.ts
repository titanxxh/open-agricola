import { Occupation } from '../types'

const CARD_ID = 'E125_DelayedWayfarer'

export const E125_DelayedWayfarer = new Occupation({
  id: CARD_ID,
  name: 'Delayed Wayfarer',
  deck: 'E',
  number: 125,
  category: 'BUILDING_RESOURCES_-_ALL',
  desc: [
    'When you play this card, you immediately get 1 building resource of your choice and, once all people have been placed this round, you can place a person from your supply.',
  ],
  cost: {},
  players: '1+',
})
