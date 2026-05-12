import { Occupation } from '../types'

const CARD_ID = 'D130_RecreationalCarpenter'

export const D130_RecreationalCarpenter = new Occupation({
  id: CARD_ID,
  name: 'Recreational Carpenter',
  deck: 'D',
  number: 130,
  category: 'ACTIONS_BOOSTER',
  desc: ['At the end of each work phase in which you did not use the __Meeting Place__ action space, you can take a __Build Rooms__ action without placing a person.'],
  cost: {},
  players: '3+',
})
