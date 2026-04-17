import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'D82_HuntingTrophy'

const HOUSE_REDEV = 'house-redevelopment'
const FARM_REDEV = 'farm-redevelopment'

const BUILDING_RESOURCES = ['wood', 'clay', 'stone', 'reed'] as const

/**
 * D82 Hunting Trophy (MinorImprovement, D, 82)
 *
 * BGA behavior:
 *   - Cost: 1 boar to play (simplification: pay boar — BGA "return or cook" treated
 *     as pay).
 *   - Effect 1: When you build an improvement on the House Redevelopment action
 *     space, the cost is reduced by 1 building resource of the player's choice.
 *     Here: heuristic picks the most-expensive (largest count) building resource
 *     in the current cost map.
 *   - Effect 2: When you build fences on the Farm Redevelopment action space,
 *     the wood cost is reduced by 3 total.
 *   - VP: 1
 *   - Category: BUILDING_RESOURCE_PROVIDER
 *
 * Detection: The engine keeps `context.space` set to the OUTER action space
 * (house-redevelopment / farm-redevelopment) throughout the nested flow. Thus
 * filtering `context.space?.id === 'house-redevelopment'` inside the
 * computeCosts listener for the inner `improvement-any` / `fence` actions
 * correctly scopes the discount to those spaces only.
 */

const improvementCostListener: CardListenerRegistration = {
  id: 'D82-hunting-trophy-compute-costs-improvement',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (context.space?.id !== HOUSE_REDEV) return
    const costs = (context.costs ?? {}) as Record<string, number>
    let maxRes: string | null = null
    let maxVal = 0
    for (const res of BUILDING_RESOURCES) {
      const val = costs[res] ?? 0
      if (val > maxVal) {
        maxVal = val
        maxRes = res
      }
    }
    if (!maxRes) return
    return { costs: { [maxRes]: -1 } }
  },
}

const fencingCostListener: CardListenerRegistration = {
  id: 'D82-hunting-trophy-compute-costs-fencing',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['fencing', 'fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (context.space?.id !== FARM_REDEV) return
    return { costs: { wood: -3 } }
  },
}

registerCardListener(improvementCostListener)
registerCardListener(fencingCostListener)

export const D82_HuntingTrophy = new MinorImprovement({
  id: CARD_ID,
  name: 'Hunting Trophy',
  deck: 'D',
  number: 82,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Improvements built on __House Redevelopment__ cost you 1 building resource of your choice less. Fences built on __Farm Redevelopment__ cost you a total of 3 <WOOD> less.',
  ],
  cost: { boar: 1 },
  vp: 1,
})
