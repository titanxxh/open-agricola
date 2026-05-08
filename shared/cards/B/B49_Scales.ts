import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B49_Scales } from '../../cards-display/B/B49_Scales'
export { B49_Scales }

const CARD_ID = B49_Scales.id

/**
 * B49 Scales
 * Each time after you place an improvement or occupation in front of you,
 * if you then have the same number of improvements and occupations in play,
 * you get 2 food.
 *
 * BGA: countOccupations() == countAllImprovements()
 * Passing cards do not trigger this (they are never "in front of you").
 * We count occupationPlayed.length vs (minorPlayed.length + improvements.length).
 */

const checkBalance = (context: CardListenerContext): ActionHookResult | void => {

  const occCount = context.player.occupationPlayed.length
  const impCount =
    context.player.minorPlayed.length + context.player.improvements.length

  if (occCount === impCount) {
    return { flow: gainLeaf(CARD_ID, { food: 2 }), sourceCard: CARD_ID }
  }
}

const occupationListener: CardListenerRegistration = {
  id: 'B49-scales-after-occupation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: checkBalance,
}

const improvementListener: CardListenerRegistration = {
  id: 'B49-scales-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['play-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Passing cards do not trigger Scales
    if (context.extraData?.passing) return
    return checkBalance(context)
  },
}

export const B49_Scales_impl = {
  listeners: [occupationListener, improvementListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
