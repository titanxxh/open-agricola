import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E165_MasterHuntsman } from '../../cards-display/E/E165_MasterHuntsman'

const CARD_ID = E165_MasterHuntsman.id

/**
 * E165 Master Huntsman:
 * When you play this card and each time you build a major improvement, you get 1 pig.
 *
 * BGA: onBuy → gain 1 pig.
 *      isListeningTo → isActionEvent(Improvement) && cardId has type MAJOR.
 *      onPlayerAfterImprovement → gain 1 pig.
 *
 * Occupation onBuy flows must use a play-occupation listener (engine does not
 * process onBuy flows for occupations).
 */
const onBuyListener: CardListenerRegistration = {
  id: 'E165-master-huntsman-onbuy',
  cardIds: [CARD_ID],
  actions: ['play-occupation'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== CARD_ID) return
    return { flow: gainLeaf(CARD_ID, { boar: 1 }), sourceCard: CARD_ID }
  },
}

const majorImprovementListener: CardListenerRegistration = {
  id: 'E165-master-huntsman-after-major',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const choice = context.choice
    if (!choice || !choice.startsWith('major:')) return
    return { flow: gainLeaf(CARD_ID, { boar: 1 }), sourceCard: CARD_ID }
  },
}

export const E165_MasterHuntsman_impl = {
  listeners: [onBuyListener, majorImprovementListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
