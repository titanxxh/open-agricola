import { Occupation } from '../types'

const CARD_ID = 'A115_ChiefForester'

export const A115_ChiefForester = new Occupation({
  id: CARD_ID,
  name: 'Chief Forester',
  deck: 'A',
  number: 115,
  category: 'CROP_PROVIDER',
  desc: ['Each time you use a wood accumulation space, you also get a __Sow__ action for exactly 1 field.'],
  cost: {},
  players: '1+',
})
