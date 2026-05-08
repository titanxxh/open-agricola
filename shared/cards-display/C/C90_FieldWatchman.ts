import { Occupation } from '../types'

const CARD_ID = 'C90_FieldWatchman'

export const C90_FieldWatchman = new Occupation({
  id: CARD_ID,
  name: 'Field Watchman',
  deck: 'C',
  number: 90,
  category: 'FARM_PLANNER',
  desc: ['Each time you use the __Grain Seeds__ action space, you can also plow 1 field.'],
  cost: {},
  players: '1+',
})
