import { Occupation } from '../types'

const CARD_ID = 'D129_LumberVirtuoso'

export const D129_LumberVirtuoso = new Occupation({
  id: CARD_ID,
  name: 'Lumber Virtuoso',
  deck: 'D',
  number: 129,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Each harvest in which you have at least 5 <WOOD> in your supply, you can discard down to 5 <WOOD> to take a __Build Stables__ or __Build Wood Rooms__ action by paying the usual costs.',
  ],
  cost: {},
  players: '3+',
})
