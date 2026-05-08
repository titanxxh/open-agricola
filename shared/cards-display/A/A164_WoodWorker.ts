import { Occupation } from '../types'

const CARD_ID = 'A164_WoodWorker'

export const A164_WoodWorker = new Occupation({
  id: CARD_ID,
  name: 'Wood Worker',
  deck: 'A',
  number: 164,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Each time you take <WOOD> from an accumulation space, you can exchange 1 <WOOD> for 1 <SHEEP>. Place the <WOOD> on the accumulation space.'],
  cost: {},
  players: '4+',
  newSet: true,
})
