import { Occupation } from '../types'

const CARD_ID = 'D166_StableMilker'

export const D166_StableMilker = new Occupation({
  id: CARD_ID,
  name: 'Stable Milker',
  deck: 'D',
  number: 166,
  category: 'LIVESTOCK_PROVIDER',
  desc: [
    'Each time you build at least 2 stables on the same turn, you also get 1 <CATTLE>.',
  ],
  cost: {},
  players: '4+',
  evenMoreSet: true,
})
