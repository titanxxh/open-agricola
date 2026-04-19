import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { futureMeeplesNode } from '../../actions/effects/future-meeples'
import type { FutureMeepleRequest } from '../../game/types'

const CARD_ID = 'E47_SyrupTap'

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
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const gained =
      context.result?.type === 'ok' ? context.result.resourcesGained : undefined
    if (!gained || (gained.wood ?? 0) <= 0) return

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

registerCardListener(afterCollectListener)

export const E47_SyrupTap = new MinorImprovement({
  id: CARD_ID,
  name: 'Syrup Tap',
  deck: 'E',
  number: 47,
  desc: ['Each time you get at least 1 <WOOD> from an action space, place 1 <FOOD> on the next round space. At the start of that round, you get the <FOOD>.'],
  cost: { wood: 1, stone: 1 },
  vp: 1,
})
