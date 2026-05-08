import { Occupation } from '../types'

const CARD_ID = 'D139_Chairman'

export const D139_Chairman = new Occupation({
  id: CARD_ID,
  name: "Chairman",
  deck: "D",
  number: 139,
  category: "FOOD_PROVIDER",
  desc: [
    'Each time another player uses the __Meeting Place__ action space, both they and you get 1 <FOOD> (before taking the actions). If you use it, you get 1 <FOOD>.',
  ],
  cost: {},
  players: "3+",
})
