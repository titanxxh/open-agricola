import { Occupation } from '../types'

const CARD_ID = 'B107_Manservant'

export const B107_Manservant = new Occupation({
  id: CARD_ID,
  name: 'Manservant',
  deck: 'B',
  number: 107,
  category: 'FOOD_PROVIDER',
  desc: [
    'Once you live in a stone house, place 3 <FOOD> on each remaining round space. At the start of these rounds, you get the <FOOD>.',
  ],
  cost: {},
  players: '1+',
})
