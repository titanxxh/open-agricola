import { Occupation } from '../types'

const CARD_ID = 'B166_CattleFeeder'

export const B166_CattleFeeder = new Occupation({
  id: CARD_ID,
  name: 'Cattle Feeder',
  deck: 'B',
  number: 166,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Each time you use the __Grain Seeds__ action space, you can also buy 1 <CATTLE> for 1 <FOOD>.'],
  cost: {},
  players: '4+',
})
