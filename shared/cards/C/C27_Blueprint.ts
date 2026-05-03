import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C27_Blueprint'

const ALLOWED_MAJORS = ['Major_Joinery', 'Major_Pottery', 'Major_Basket'] as const

/**
 * C27 Blueprint — You can build Joinery, Pottery, and Basketmaker's Workshop
 * even when taking a Minor Improvement action. They each cost 1 stone less.
 *
 * BGA: `onPlayerComputeCardCosts` clones any cost-trade containing stone and
 * subtracts 1 (giving the player two payment paths: original cost OR
 * stone-discounted cost). The "buildable via minor-improvement action" part
 * is naturally part of BGA's improvement-action wiring.
 *
 * Implementation:
 *   1. `computeCosts` listener with straight `stone:-1` override on the 3
 *      allowed majors (simplification — BGA's trade-clone semantics is
 *      registered as §2.5: with C27 we always discount stone, BGA also
 *      preserves the original non-discounted trade so e.g. an alternative
 *      payment path exists for cards that already used a stone-trade).
 *   2. `computeChoiceCandidates` listener (mirrors D131 pattern) injecting
 *      the 3 allowed majors into the minor-improvement action choice list
 *      so the player can build them via the minor-improvement action space.
 */
const computeCostsListener: CardListenerRegistration = {
  id: 'C27-blueprint-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.cardId || !ALLOWED_MAJORS.includes(context.cardId as typeof ALLOWED_MAJORS[number])) return
    return { costs: { stone: -1 } }
  },
}

const choiceCandidateListener: CardListenerRegistration = {
  id: 'C27-blueprint-compute-choice-candidates',
  cardIds: [CARD_ID],
  actions: ['minor-improvement'],
  phases: ['computeChoiceCandidates' as ActionHookPhase],
  handler: (ctx: CardListenerContext): ActionHookResult | void => {
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
  listeners: [computeCostsListener, choiceCandidateListener],
  reaches: [...ALLOWED_MAJORS] as readonly string[],
} satisfies CardImpl
