import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readImprovementTypes } from '../../actions/effects/improvement'
import type { ActionChoiceOption } from '../../contract/types'
import type { CardImpl } from '../registry'
import { PaymentSolver } from '../../actions/payment'
import { filterAvailableMajorImprovementIds } from '../major/supply'

const CARD_ID = 'C027_Blueprint'
const ALLOWED_MAJORS = ['Major_Joinery', 'Major_Pottery', 'Major_Basket'] as const

/**
 * C27 Blueprint — You can build Joinery, Pottery, and Basketmaker's Workshop
 * even when taking a Minor Improvement action. They each cost 1 stone less.
 *
 * Rule: `onPlayerComputeCardCosts` clones any cost-trade containing stone and
 * subtracts 1 (giving the player two payment paths: original cost OR
 * stone-discounted cost). The "buildable via minor-improvement action" part
 * is naturally part of the reference's improvement-action wiring.
 */
const computeCostsListener: CardListenerRegistration = {
  id: 'C27-blueprint-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement'],
  deriveCardCostCandidate: (context, candidate) => {
    if (!context.cardId || !ALLOWED_MAJORS.includes(context.cardId as typeof ALLOWED_MAJORS[number])) {
      return null
    }
    return PaymentSolver.discountCardCostCandidate(candidate, CARD_ID, { stone: 1 })
  },
}

const choiceCandidateListener: CardListenerRegistration = {
  id: 'C27-blueprint-compute-choice-candidates',
  cardIds: [CARD_ID],
  actions: ['improvement'],
  phases: ['computeChoiceCandidates' as ActionHookPhase],
  handler: (ctx: CardListenerContext): ActionHookResult | void => {
    const types = readImprovementTypes(ctx)
    if (types.length !== 1 || types[0] !== 'minor') return
    if (ctx.actionContext?.trueAction === false) return
    if (ctx.sourceCard) return
    if (!ctx.player.minorPlayed.includes(CARD_ID)) return
    const extraOptions: ActionChoiceOption[] = filterAvailableMajorImprovementIds(ctx.state, ALLOWED_MAJORS)
      .map((id) => ({
        value: id,
        labelKey: `improvements.${id}.name`,
        sourceCard: CARD_ID,
      }))
    if (extraOptions.length === 0) return
    return { extraOptions, sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [computeCostsListener, choiceCandidateListener],
  reaches: [...ALLOWED_MAJORS] as readonly string[],
} satisfies CardImpl

export const C027_Blueprint = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Blueprint',
    deck: 'C',
    number: 27,
    category: 'ACTIONS_BOOSTER',
    desc: ["You can build the major improvements __Joinery__, __Pottery__, and __Basketmaker's Workshop__ even when taking a __Minor Improvement__ action. They each cost you 1 <STONE> less."],
    cost: { food: 1 },
  },
  impl: cardImpl,
})

export const C027_Blueprint_impl = C027_Blueprint.impl
