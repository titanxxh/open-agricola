import { Occupation } from '../types'

const CARD_ID = 'C132_TimberShingleMaker'

export const C132_TimberShingleMaker = new Occupation({
  id: CARD_ID,
  name: 'Timber Shingle Maker',
  deck: 'C',
  number: 132,
  category: 'POINTS_PROVIDER',
  desc: [
    'When you renovate to stone, you can place up to 1 <WOOD> from your supply in each of your rooms. During scoring, each such <WOOD> is worth 1 bonus <SCORE>.',
  ],
  cost: {},
  players: '3+',
  extraVp: true,
  evenMoreSet: true,
})
