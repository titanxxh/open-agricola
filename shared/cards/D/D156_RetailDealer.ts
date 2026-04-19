import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D156_RetailDealer'

/**
 * Place 3 grain and 3 food on this card. Each time you use the
 * Resource Market action space, you also get 1 grain and 1 food
 * from this card.
 *
 * Uses a counter (remaining: 3) in extraData. Each Resource Market
 * use decrements the counter and grants 1 grain + 1 food.
 */
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    writeCardExtraData(player, CARD_ID, 'remaining', 3)
  },
})

const listener: CardListenerRegistration = {
  id: 'D156-retail-dealer-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'resource-market-4') return
    const remaining = readCardExtraData<number>(context.player, CARD_ID, 'remaining') ?? 0
    if (remaining <= 0) return
    writeCardExtraData(context.player, CARD_ID, 'remaining', remaining - 1)
    return {
      flow: gainLeaf(CARD_ID, { grain: 1, food: 1 }),
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const D156_RetailDealer = new Occupation({
  id: CARD_ID,
  name: 'Retail Dealer',
  deck: 'D',
  number: 156,
  category: 'GOODS_PROVIDER',
  desc: ['Place 3 <GRAIN> and 3 <FOOD> on this card. Each time you use the __Resource Market__ action space, you also get 1 <GRAIN> and 1 <FOOD> from this card.'],
  cost: {},
  players: '4+',
})
