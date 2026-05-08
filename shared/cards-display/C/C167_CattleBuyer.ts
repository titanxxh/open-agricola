import { Occupation } from '../types'

const CARD_ID = 'C167_CattleBuyer'

export const C167_CattleBuyer = new Occupation({
  id: CARD_ID,
  name: 'Cattle Buyer',
  deck: 'C',
  number: 167,
  category: 'LIVESTOCK_PROVIDER',
  desc: [
    'Each time another player uses the __Fencing__ action space, you can buy exactly 1 <SHEEP>/<PIG>/<CATTLE> from the general supply for 1/2/2 <FOOD>.',
  ],
  cost: {},
  players: '4+',
  evenMoreSet: true,
})
