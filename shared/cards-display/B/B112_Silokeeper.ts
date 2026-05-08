import { Occupation } from '../types'

const CARD_ID = 'B112_Silokeeper'

export const B112_Silokeeper = new Occupation({
  id: CARD_ID,
  name: 'Silokeeper',
  deck: 'B',
  number: 112,
  category: 'CROP_PROVIDER',
  desc: ['Each time you use the action space card that has been revealed right before the most recent harvest, you also get 1 <GRAIN>.'],
  cost: {},
  players: '1+',
  newSet: true,
})
