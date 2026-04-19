import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'A75_LumberMill'

/**
 * A75 Lumber Mill — Every improvement costs you 1 wood less.
 * BGA: onPlayerComputeCardCosts, applies to MAJOR and MINOR types.
 */
const computeCostsListener: CardListenerRegistration = {
  id: 'A75-lumber-mill-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { costs: { wood: -1 } }
  },
}

registerCardListener(computeCostsListener)

export const A75_LumberMill = new MinorImprovement({
  id: CARD_ID,
  name: 'Lumber Mill',
  deck: 'A',
  number: 75,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Every improvement costs you 1 <WOOD> less.'],
  cost: { stone: 2 },
  vp: 2,
  prerequisite: 'At most 3 Occupations',
  occupationPrerequisites: { max: 3 },
})
