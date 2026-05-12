import { Occupation } from '../types'

const CARD_ID = 'B92_LittleStickKnitter'

export const B92_LittleStickKnitter = new Occupation({
  id: CARD_ID,
  name: 'Little Stick Knitter',
  deck: 'B',
  number: 92,
  category: 'ACTIONS_BOOSTER',
  desc: ['From Round 5 on, each time you use the __Sheep Market__ accumulation space, you can also take a __Family Growth with Room Only__ action.'],
  cost: {},
  players: '1+',
})
