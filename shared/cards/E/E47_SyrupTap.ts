import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { FutureMeepleRequest } from '../../contract/types'
import type { CardImpl } from '../registry'
import { E47_SyrupTap } from '../../cards-display/E/E47_SyrupTap'
import { hasResourceMovedFromActionSpace } from '../helpers/event-provenance'

const CARD_ID = E47_SyrupTap.id

/**
 * E47 Syrup Tap: Each time you get at least 1 wood from an action space,
 * place 1 food on the next round space. At the start of that round, you get the food.
 *
 * Implementation: listen on 'collect' after phase, check if wood was gained.
 * Use deferred futureMeeplesNode pattern to queue 1 food on next round.
 */
const afterCollectListener: CardListenerRegistration = {
  id: 'E47-syrup-tap-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard === CARD_ID) return

    const gainedWoodFromActionSpace = hasResourceMovedFromActionSpace(
      context.transactionEvents,
      'wood',
      (event) => event.to.kind === 'player' && event.to.playerId === context.player.id,
    )
    if (!gainedWoodFromActionSpace) return

    const nextRound = context.state.round + 1
    if (nextRound > 14) return

    const request: FutureMeepleRequest = {
      cardId: CARD_ID,
      playerId: context.player.id,
      entries: [{ round: nextRound, resources: { food: 1 } }],
    }

    return {
      flow: futureMeeplesNode(request),
      sourceCard: CARD_ID,
    }
  },
}

export const E47_SyrupTap_impl = {
  listeners: [afterCollectListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
