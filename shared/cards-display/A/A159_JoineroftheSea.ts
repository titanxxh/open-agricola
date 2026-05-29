import { Occupation } from '../types'

const CARD_ID = 'A159_JoineroftheSea'

export const A159_JoineroftheSea = new Occupation({
  id: CARD_ID,
  name: 'Joiner of the Sea',
  deck: 'A',
  number: 159,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time another player uses the __Fishing__/__Reed Bank__ accumulation space, you can give them 1 <WOOD> to get 2 <FOOD>/3 <FOOD> from the general supply.',
  ],
  cost: {},
  players: '4+',
  waresSalesmanGains: [{ wood: 1, reed: 1 }],
})
