import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import { initCardState } from '../__stubs__/helpers'

const CARD_ID = 'D106_WhiskyDistiller'

/**
 * D106 Whisky Distiller — At any time, you can pay 1 <GRAIN>.
 * If you do, add 2 to the current round and place 4 <FOOD> on the corresponding
 * round space. At the start of that round, you get the <FOOD>.
 *
 * BGA: isListeningTo returns true if current round <= 12.
 * onPlayerAtAnytime → payNode([GRAIN=>1]) + futureMeeplesNode([FOOD=>4], ['+2']).
 *
 * Implementation: Store a pending food count in cardStates. onRoundStart checks
 * if pending food from specific rounds is due. We track pending as a simple counter
 * (number of 4-food deliveries pending).
 * Players: 1+.
 */
registerCardEffect({
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    const pending = player.cardStates?.[CARD_ID]?.counters?.pending ?? 0
    if (pending <= 0) return
    const counters = initCardState(player, CARD_ID)
    counters.pending = pending - 1
    return gainLeaf(CARD_ID, { food: 4 })
  },
})

const anytimeListener: CardListenerRegistration = {
  id: 'D106-whisky-distiller-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.state.round > 12) return // no round+2 would exist after round 12
    if ((context.player.resources.grain ?? 0) < 1) return
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { grain: 1 } }),
          {
            type: 'leaf',
            actionId: 'store-on-card',
            params: { pending: 1 },
            sourceCard: CARD_ID,
          },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.D106_WhiskyDistiller.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const D106_WhiskyDistiller = new Occupation({
  id: CARD_ID,
  name: 'Whisky Distiller',
  deck: 'D',
  number: 106,
  category: 'FOOD_PROVIDER',
  desc: ['At any time, you can pay 1 <GRAIN>. If you do, add 2 to the current round and place 4 <FOOD> on the corresponding round space. At the start of that round, you get the <FOOD>.'],
  cost: {},
  players: '1+',
  newSet: true,
})
