import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'

const CARD_ID = 'A92_AdoptiveParents'

/**
 * A92 Adoptive Parents:
 * For 1 food, you can take an action with offspring in the same round you get it.
 * If you do, the offspring does not count as "newborn".
 *
 * BGA:
 * - afterPlaceFarmer: if player has adoptive-available offspring → optional pay 1 food,
 *   then growChild → places newborn at home, marks as adult, grants extra place-farmer.
 *
 * Implementation: After place-farmer, if player has newbornCount > 0 and not flagged:
 * - Offer: pay 1 food → flag card → "grow" the child (decrement newbornCount,
 *   increment workersAvailable) → place-farmer.
 *
 * The newborn→adult conversion is done via the 'before' hook on the place-farmer
 * that follows — we flag the card during pay, then the before-place-farmer hook
 * checks the flag and does the conversion. Actually, a simpler approach:
 * We use a special "grow-child" gain leaf that has a side effect.
 *
 * Simplest approach: The card's handler modifies state inline (allowed in listeners)
 * but the modification happens at flow evaluation time which is wrong.
 *
 * Correct approach: Use a gain leaf with 0 resources, and have a before-gain listener
 * that does the conversion. But gain actions with 0 params may be skipped.
 *
 * Best approach: Use the fact that when a seq is committed to (player didn't skip),
 * all children execute. We put a special before-hook on the place-farmer that
 * recognizes the A92 context and does the conversion.
 *
 * We use a computeReplace hook: when A92 is flagged and place-farmer is about to
 * execute, we first do the newborn→adult conversion.
 */

// Before-hook on place-farmer: if A92 is flagged, convert newborn to adult
const beforePlaceFarmerListener: CardListenerRegistration = {
  id: 'A92-adoptive-parents-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (!isCardFlagged(context.player, CARD_ID)) return
    // Convert newborn to adult
    if (context.player.newbornCount > 0) {
      context.player.newbornCount -= 1
      // workersAvailable is already incremented since the place-farmer action
      // is given — it was added as a child in the flow. The player gets an extra
      // placement because we already incremented workersAvailable during the
      // afterPlaceFarmer handler when we set the flag.
    }
    setCardFlag(context.player, CARD_ID, false)
  },
}

// After place-farmer: offer the adoptive parents choice
const afterPlaceFarmerListener: CardListenerRegistration = {
  id: 'A92-adoptive-parents-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.newbornCount <= 0) return

    // Flag the card and increment workersAvailable as part of accepting
    // The pay + flag happens in the flow; the before-place-farmer does conversion
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          {
            type: 'leaf',
            actionId: 'gain',
            params: {},
            sourceCard: CARD_ID,
            actionContext: { adoptiveParentsActivation: true },
          },
          {
            type: 'leaf',
            actionId: 'place-farmer',
            sourceCard: CARD_ID,
            actionContext: { trueAction: false },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

// Before gain with adoptiveParentsActivation: do the newborn→adult conversion
const beforeGainActivation: CardListenerRegistration = {
  id: 'A92-adoptive-parents-before-gain-activation',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['gain'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (!context.actionContext?.adoptiveParentsActivation) return
    // Convert newborn → adult worker
    if (context.player.newbornCount > 0) {
      context.player.newbornCount -= 1
      context.player.workersAvailable += 1
    }
    setCardFlag(context.player, CARD_ID, true)
  },
}

registerCardListener(afterPlaceFarmerListener)
registerCardListener(beforeGainActivation)
registerCardListener(beforePlaceFarmerListener)

export const A92_AdoptiveParents = new Occupation({
  id: CARD_ID,
  name: 'Adoptive Parents',
  deck: 'A',
  number: 92,
  category: 'ACTIONS_BOOSTER',
  desc: ['For 1 <FOOD>, you can take an action with offspring in the same round you get it. If you do, the offspring does not count as "newborn".'],
  cost: {},
  players: '1+',
})
