import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'E6_Recount'

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    const types: Array<[keyof typeof player.resources, string]> = [
      ['wood', 'wood'],
      ['clay', 'clay'],
      ['reed', 'reed'],
      ['stone', 'stone'],
    ]
    const gains: Partial<typeof player.resources> = {}
    for (const [key] of types) {
      if ((player.resources[key] ?? 0) >= 4) {
        gains[key] = 1
      }
    }
    if (Object.keys(gains).length === 0) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: gains,
    }
  },
})

export const E6_Recount = new MinorImprovement({
  id: CARD_ID,
  name: 'Recount',
  deck: 'E',
  number: 6,
  category: 'RESOURCE_WOOD',
  desc: ['You immediately get 1 building resource of each type of which you have 4 or more resources in your supply already.'],
  passing: true,
})
