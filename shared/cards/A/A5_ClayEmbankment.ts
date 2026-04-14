import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'A5_ClayEmbankment'

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    const clay = player.resources.clay
    if (clay < 2) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { clay: Math.floor(clay / 2) },
    }
  },
})

export const A5_ClayEmbankment = new MinorImprovement({
  id: CARD_ID,
  name: 'Clay Embankment',
  deck: 'A',
  number: 5,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['You immediately get 1 <CLAY> for every 2 <CLAY> you already have in your supply.'],
  cost: { food: 1 },
  passing: true,
})
