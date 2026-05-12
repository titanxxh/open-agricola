import { Occupation } from '../types'

const CARD_ID = 'D160_Midwife'

export const D160_Midwife = new Occupation({
  id: CARD_ID,
  name: 'Midwife',
  deck: 'D',
  number: 160,
  category: 'CROP_PROVIDER',
  desc: [
    'Each time another player uses the first person they place in a round to take a __Family Growth__ action, you get 1 <GRAIN> from the general supply.',
  ],
  cost: {},
  players: '4+',
})
