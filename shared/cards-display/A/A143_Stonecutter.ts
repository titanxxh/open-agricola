import { Occupation } from '../types'
import type { BonusModifier } from '../../contract/types'

const CARD_ID = 'A143_Stonecutter'

export const A143_Stonecutter = new Occupation({
  id: CARD_ID,
  name: 'Stonecutter',
  deck: 'A',
  number: 143,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Every improvement, room, and renovation costs you 1 <STONE> less.'],
  cost: {},
  players: '3+',
  modifiers: [
    {
      type: 'bonus',
      cardId: CARD_ID,
      appliesTo: ['construct'],
      discount: { stone: 1 },
    },
    {
      type: 'bonus',
      cardId: CARD_ID,
      appliesTo: ['renovation'],
      discount: { stone: 1 },
    },
  ] as BonusModifier[],
})
