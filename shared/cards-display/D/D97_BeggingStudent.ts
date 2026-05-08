import { Occupation } from '../types'

const CARD_ID = 'D97_BeggingStudent'

export const D97_BeggingStudent = new Occupation({
  id: CARD_ID,
  name: 'Begging Student',
  deck: 'D',
  number: 97,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'When you play this card, you must immediately take 1 <BEGGING> marker. At the start of each harvest, you can play 1 occupation without paying an occupation cost.',
  ],
  cost: {},
  players: '1+',
})
