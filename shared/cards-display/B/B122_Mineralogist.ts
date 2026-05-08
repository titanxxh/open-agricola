import { Occupation } from '../types'

const CARD_ID = 'B122_Mineralogist'

export const B122_Mineralogist = new Occupation({
  id: CARD_ID,
  name: 'Mineralogist',
  deck: 'B',
  number: 122,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time you use a clay/stone accumulation space, you also get 1 of the other good, <STONE>/<CLAY>.',
  ],
  cost: {},
  players: '1+',
  newSet: true,
})
