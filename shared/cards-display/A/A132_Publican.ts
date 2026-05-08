import { Occupation } from '../types'

const CARD_ID = 'A132_Publican'

export const A132_Publican = new Occupation({
  id: CARD_ID,
  name: 'Publican',
  deck: 'A',
  number: 132,
  category: 'POINTS_PROVIDER',
  desc: [
    'Each time before another player takes an unconditional __Sow__ action, you can give them 1 <GRAIN> from your supply to get 1 bonus <SCORE>.',
  ],
  cost: {},
  players: '3+',
  extraVp: true,
})
