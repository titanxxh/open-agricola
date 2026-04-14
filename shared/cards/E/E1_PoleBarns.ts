import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E1_PoleBarns'

registerCardEffect({
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'stables',
    sourceCard: CARD_ID,
    optional: true,
    params: { max: 3, freeCost: true },
  }),
})

export const E1_PoleBarns = new MinorImprovement({
  id: CARD_ID,
  name: 'Pole Barns',
  deck: 'E',
  number: 1,
  category: 'FARM_BUILDER',
  desc: ['You can immediately build up to 3 stables at no cost. (You must pay the cost of this card though.)'],
  cost: { wood: 2 },
  passing: true,
  prerequisite: '15 Fences Built',
})
