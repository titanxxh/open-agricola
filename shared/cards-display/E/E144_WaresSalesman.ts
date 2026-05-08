import { Occupation } from '../types'

const CARD_ID = 'E144_WaresSalesman'

export const E144_WaresSalesman = new Occupation({
  id: CARD_ID,
  name: 'Wares Salesman',
  deck: 'E',
  number: 144,
  category: 'BUILDING_RESOURCES_-_REED',
  desc: [
    'Each time any player (including you) plays or builds a card that lets them turn building resources into <FOOD>, you get exactly 1 corresponding building resource and 1 <REED>.',
  ],
  cost: {},
  players: '3+',
})
