import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D1_ZigzagHarrow'

registerCardEffect({
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'plow',
    sourceCard: CARD_ID,
    optional: true,
    // TODO: restrict to zigzag-completing field locations (requires board geometry support)
  }),
})

export const D1_ZigzagHarrow = new MinorImprovement({
  id: CARD_ID,
  name: 'Zigzag Harrow',
  deck: 'D',
  number: 1,
  category: 'FARM_PLANNER',
  desc: ['You can immediately plow 1 field such that it completes a "zigzag" pattern.'],
  cost: { wood: 1 },
  passing: true,
  prerequisite: '3 Fields in an "L" Shape',
})
