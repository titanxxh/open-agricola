import { Occupation } from '../types'

const CARD_ID = 'E146_Reseller'

export const E146_Reseller = new Occupation({
  id: CARD_ID,
  name: 'Reseller',
  deck: 'E',
  number: 146,
  category: 'BUILDING_RESOURCES_-_ALL',
  desc: [
    'Once this game, immediately after playing or building an improvement, you can choose to get its printed cost from the general supply.',
  ],
  cost: {},
  players: '3+',
})
