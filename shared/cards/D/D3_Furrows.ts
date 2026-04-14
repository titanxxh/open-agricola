import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D3_Furrows'

registerCardEffect({
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'sow',
    sourceCard: CARD_ID,
    optional: true,
    actionContext: { maxSelections: 1 },
  }),
})

export const D3_Furrows = new MinorImprovement({
  id: CARD_ID,
  name: 'Furrows',
  deck: 'D',
  number: 3,
  category: 'FARM_PLANNER',
  desc: ['You can immediately sow in exactly 1 field.'],
  cost: {},
  passing: true,
  newSet: true,
})
