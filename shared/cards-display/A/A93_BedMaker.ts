import { Occupation } from '../types'

const CARD_ID = 'A93_BedMaker'

export const A93_BedMaker = new Occupation({
  id: CARD_ID,
  name: 'Bed Maker',
  deck: 'A',
  number: 93,
  category: 'ACTIONS_BOOSTER',
  desc: ['Each time you add rooms to your house, you can also pay 1 <WOOD> and 1 <GRAIN> to immediately get a __Family Growth with Room Only__ action.'],
  cost: {},
  players: '1+',
})
