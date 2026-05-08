import { Occupation } from '../types'

const CARD_ID = 'C160_Outrider'

export const C160_Outrider = new Occupation({
  id: CARD_ID,
  name: 'Outrider',
  deck: 'C',
  number: 160,
  category: 'CROP_PROVIDER',
  desc: [
    'Each time before you use the action space on the most recently revealed action space card (after it has been placed on the round space), you get 1 <GRAIN>.',
  ],
  cost: {},
  players: '4+',
  newSet: true,
})
