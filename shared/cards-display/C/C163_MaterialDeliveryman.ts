import { Occupation } from '../types'

const CARD_ID = 'C163_MaterialDeliveryman'

export const C163_MaterialDeliveryman = new Occupation({
  id: CARD_ID,
  name: 'Material Deliveryman',
  deck: 'C',
  number: 163,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Each time any player (including you) takes 5/6/7/8+ goods from an accumulation space, you get 1 <WOOD>/<CLAY>/<REED>/<STONE> from the general supply.',
  ],
  cost: {},
  players: '4+',
})
