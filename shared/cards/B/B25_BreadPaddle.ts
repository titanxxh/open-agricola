import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B25_BreadPaddle'

/**
 * B25 Bread Paddle:
 * When you play this card, you immediately get 1 Food.
 * For each occupation you play, you get an additional Bake Bread action.
 *
 * BGA: onBuy → gain 1 food.
 *      isListeningTo → isActionEvent(Occupation).
 *      onPlayerAfterOccupation → bakeBreadNode().
 */
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { food: 1 }),
})

const listener: CardListenerRegistration = {
  id: 'B25-bread-paddle-after-occupation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'bake-bread',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
      },
      logKey: 'log.cardGrantedAction',
      logParams: { cardId: CARD_ID, actionId: 'bake-bread' },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const B25_BreadPaddle = new MinorImprovement({
  id: CARD_ID,
  name: 'Bread Paddle',
  deck: 'B',
  number: 25,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'When you play this card, you immediately get 1 <FOOD>. For each occupation you play, you get an additional __Bake Bread__ action.',
  ],
  cost: { wood: 1 },
})
