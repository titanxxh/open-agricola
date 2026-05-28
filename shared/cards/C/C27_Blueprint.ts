import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readImprovementTypes } from '../../actions/effects/improvement'
import type { ActionChoiceOption } from '../../contract/types'
import type { CardImpl } from '../registry'
import { C27_Blueprint } from '../../cards-display/C/C27_Blueprint'

const CARD_ID = C27_Blueprint.id

const ALLOWED_MAJORS = ['Major_Joinery', 'Major_Pottery', 'Major_Basket'] as const

/**
 * C27 Blueprint — You can build Joinery, Pottery, and Basketmaker's Workshop
 * even when taking a Minor Improvement action. They each cost 1 stone less.
 *
 * BGA: `onPlayerComputeCardCosts` clones any cost-trade containing stone and
 * subtracts 1 (giving the player two payment paths: original cost OR
 * stone-discounted cost). The "buildable via minor-improvement action" part
 * is naturally part of BGA's improvement-action wiring.
 */
const computeCostsListener: CardListenerRegistration = {
  id: 'C27-blueprint-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.cardId || !ALLOWED_MAJORS.includes(context.cardId as typeof ALLOWED_MAJORS[number])) return
    return {
      bonuses: [{
        discount: { stone: 1 },
        optional: true,
        sources: [CARD_ID],
        preserveOriginal: true,
      }],
    }
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
    const available = ctx.state.availableMajorImprovements ?? []
    const extraOptions: ActionChoiceOption[] = ALLOWED_MAJORS
      .filter((id) => available.includes(id))
      .map((id) => ({
        value: `major:${id}`,
        labelKey: `improvements.${id}.name`,
        sourceCard: CARD_ID,
      }))
    if (extraOptions.length === 0) return
    return { extraOptions, sourceCard: CARD_ID }
  },
}

export const C27_Blueprint_impl = {
  listeners: [computeCostsListener, choiceCandidateListener],
  reaches: [...ALLOWED_MAJORS] as readonly string[],
} satisfies CardImpl
