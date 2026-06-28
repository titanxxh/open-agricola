import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { FutureMeepleRequest } from '../../contract/types'
import type { CardImpl } from '../registry'
import { hasResourceMovedFromActionSpace } from '../helpers/event-provenance'

const CARD_ID = 'E047_SyrupTap'

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

    const events = context.actionEvents ?? context.transactionEvents
    const gainedWoodFromActionSpace = hasResourceMovedFromActionSpace(
      events,
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

const cardImpl = {
  listeners: [afterCollectListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E047_SyrupTap = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Syrup Tap',
    deck: 'E',
    number: 47,
    desc: ['Each time you get at least 1 <WOOD> from an action space, place 1 <FOOD> on the next round space. At the start of that round, you get the <FOOD>.'],
    cost: { wood: 1, stone: 1 },
    vp: 1,
    category: 'FOOD',
  },
  impl: cardImpl,
})

export const E047_SyrupTap_impl = E047_SyrupTap.impl
