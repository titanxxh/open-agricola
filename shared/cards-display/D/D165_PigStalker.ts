import { Occupation } from '../types'

const CARD_ID = 'D165_PigStalker'

export const D165_PigStalker = new Occupation({
  id: CARD_ID,
  name: 'Pig Stalker',
  deck: 'D',
  number: 165,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Each time you use an animal accumulation space, you get an additional 1 <PIG> if you occupy a Round 1-14 action space which is immediately to the left or right of that accumulation space.'],
  cost: {},
  players: '4+',
  evenMoreSet: true,
})
