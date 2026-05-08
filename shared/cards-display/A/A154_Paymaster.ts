import { Occupation } from '../types'

const CARD_ID = 'A154_Paymaster'

export const A154_Paymaster = new Occupation({
  id: CARD_ID,
  name: 'Paymaster',
  deck: 'A',
  number: 154,
  category: 'POINTS_PROVIDER',
  desc: [
    'Each time another player uses a food accumulation space, you can give them 1 <GRAIN> from your supply to get 1 bonus <SCORE>.',
  ],
  cost: {},
  players: '4+',
  extraVp: true,
})
