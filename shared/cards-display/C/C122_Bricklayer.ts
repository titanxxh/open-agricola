import { Occupation } from '../types'
import type { BonusModifier } from '../../contract/types'

const CARD_ID = 'C122_Bricklayer'

export const C122_Bricklayer = new Occupation({
  id: CARD_ID,
  name: 'Bricklayer',
  deck: 'C',
  number: 122,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each improvement and each renovation cost you 1 <CLAY> less. Each room costs you 2 <CLAY> less.'],
  cost: {},
  players: '1+',
  modifiers: [
    {
      type: 'bonus',
      cardId: CARD_ID,
      appliesTo: ['construct'],
      discount: { clay: 2 },
    },
    {
      type: 'bonus',
      cardId: CARD_ID,
      appliesTo: ['renovation'],
      discount: { clay: 1 },
    },
  ] as BonusModifier[],
})
