import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'C27_Blueprint'

const ALLOWED_MAJORS = ['Major_Joinery', 'Major_Pottery', 'Major_Basket']

/**
 * C27 Blueprint — You can build Joinery, Pottery, and Basketmaker's Workshop
 * even when taking a Minor Improvement action. They each cost 1 stone less.
 *
 * BGA: onPlayerComputeCardCosts reduces stone cost by 1 for these 3 majors.
 * The "also buildable via minor-improvement action" part is handled via the
 * computeReplace allowing major builds on minor improvement action spaces.
 */
const computeCostsListener: CardListenerRegistration = {
  id: 'C27-blueprint-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.cardId || !ALLOWED_MAJORS.includes(context.cardId)) return
    return { costs: { stone: -1 } }
  },
}

export const C27_Blueprint = new MinorImprovement({
  id: CARD_ID,
  name: 'Blueprint',
  deck: 'C',
  number: 27,
  category: 'ACTIONS_BOOSTER',
  desc: ["You can build the major improvements __Joinery__, __Pottery__, and __Basketmaker's Workshop__ even when taking a __Minor Improvement__ action. They each cost you 1 <STONE> less."],
  cost: { food: 1 },
})

export const C27_Blueprint_impl = {
  listeners: [computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
