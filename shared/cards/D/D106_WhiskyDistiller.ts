import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'D106_WhiskyDistiller'
/**
 * D106 Whisky Distiller (Sprint 7a F5+F6).
 *
 * The reference `Cards/D/the reference`:
 *   isListeningTo: isAnytime && Globals::getTurn() <= 12
 *   onPlayerAtAnytime: SEQ(payNode([GRAIN=>1]), futureMeeplesNode([FOOD=>4], ['+2']))
 *
 * Pay 1 grain, push 4 food onto round (current+2). At the start of that round, the
 * food is granted via the global future-meeples release path. We mirror this exactly
 * via `futureMeeplesNode` with an inline single-entry request.
 */
const anytimeListener: CardListenerRegistration = {
  id: 'D106-whisky-distiller-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.state.round + 2 > 14) return
    if ((context.player.resources.grain ?? 0) < 1) return
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { grain: 1 } }),
          futureMeeplesNode({
            cardId: CARD_ID,
            playerId: context.player.id,
            entries: [
              { round: context.state.round + 2, resources: { food: 4 } },
            ],
          }),
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.D106_WhiskyDistiller.anytime',
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  effect: {
    id: CARD_ID,
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D106_WhiskyDistiller = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Whisky Distiller',
    deck: 'D',
    number: 106,
    category: 'FOOD_PROVIDER',
    desc: ['At any time, you can pay 1 <GRAIN>. If you do, add 2 to the current round and place 4 <FOOD> on the corresponding round space. At the start of that round, you get the <FOOD>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const D106_WhiskyDistiller_impl = D106_WhiskyDistiller.impl
