import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase } from '../../actions/hooks'
import { canRenovate, getRenovation } from '../../actions/effects/renovation'

const CARD_ID = 'A87_Conservator'

/**
 * A87 Conservator (Occupation, A, 87)
 * You can renovate your wooden house directly to stone without renovating it
 * to clay first. (Optional — you may decline.)
 *
 * BGA: Cards/A/A87_Conservator.php — flavor only on the PHP side; the actual
 * direct-stone option is provided by the engine's renovate-house action.
 *
 * Implementation:
 *  - computeReplace listener on `renovate-house`: when the owner is on a
 *    wooden house, declines the standard branch and offers a same-actionId
 *    leaf with `params.skipClayTier=true`. The engine wraps the original
 *    branch and the alternative into an XOR for the player to pick.
 *  - isDoable listener on `renovate-house`: rescues entry visibility for
 *    wooden owners who can only afford the stone path (and would otherwise
 *    be hidden by the default cost preview that checks the clay path).
 *  - Renovation discounts keep firing on the Conservator branch via two
 *    independent mechanisms, so no per-discount wiring is needed:
 *      - Cost-type modifiers tagged `appliesTo: ['renovation']` (A143
 *        Stonecutter, A123 FrameBuilder) fire from `payTypedFlatCost`
 *        regardless of which branch the player picks.
 *      - actionId-keyed `computeCosts` listeners on `renovate-house`
 *        (D154 ChimneySweep) would also fire on this branch, but D154
 *        currently has its own `houseType === 'clay'` guard (tracked as
 *        a §2.3 bug in `docs/card_progress.md`) that blocks it from
 *        applying to wood→stone until that guard is removed.
 */

const computeReplaceListener: CardListenerRegistration = {
  id: 'A87-conservator-replace-renovate-house',
  cardIds: [CARD_ID],
  phases: ['computeReplace' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context) => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (context.player.houseType !== 'wood') return
    if (context.actionContext?.checkedReplaceAction === true) return
    return {
      decline: true,
      sourceCard: CARD_ID,
      alternativeFlow: {
        type: 'leaf',
        actionId: 'renovate-house',
        params: { skipClayTier: true },
        sourceCard: CARD_ID,
        choiceLabelKey: 'ui.interactionConservatorDirectStone',
      },
    }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'A87-conservator-isdoable-renovate-house',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context) => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (context.player.houseType !== 'wood') return
    if (context.doable) return
    const stonePlan = getRenovation(context.player, { skipClayTier: true })
    if (!canRenovate(context.player, undefined, stonePlan)) return
    return { doable: true }
  },
}

registerCardListener(computeReplaceListener)
registerCardListener(isDoableListener)

export const A87_Conservator = new Occupation({
  id: CARD_ID,
  name: "Conservator",
  deck: "A",
  number: 87,
  category: "FARM_PLANNER",
  desc: ["You can renovate your wooden house directly to stone without renovating it to clay first."],
  cost: {},
  players: "1+",
})
