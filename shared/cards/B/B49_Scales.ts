import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B49_Scales'

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
  if (!context.player.minorPlayed.includes(CARD_ID)) return

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

registerCardListener(occupationListener)
registerCardListener(improvementListener)

export const B49_Scales = new MinorImprovement({
  id: CARD_ID,
  name: 'Scales',
  deck: 'B',
  number: 49,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time after you place an improvement or occupation in front of you, if you then have the same number of improvements and occupations in play, you get 2 <FOOD>.',
  ],
  cost: { wood: 1 },
  prerequisite: 'No Occupation',
  occupationPrerequisites: { max: 0 },
  newSet: true,
})
