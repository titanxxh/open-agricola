import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C121_ClayKneader'

registerCardEffect({
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { wood: 1, clay: 2 }),
})

const listener: CardListenerRegistration = {
  id: 'C121-clay-kneader-after-place-farmer',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-seeds' && context.space?.id !== 'vegetable-seeds') return
    return { flow: gainLeaf(CARD_ID, { clay: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const C121_ClayKneader = new Occupation({
  id: CARD_ID,
  name: 'Clay Kneader',
  deck: 'C',
  number: 121,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'When you play this card, you immediately get 1 <WOOD> and 2 <CLAY>. Each time after you use __Grain Seeds__ or __Vegetable Seeds__ action space, you get 1 <CLAY>.',
  ],
  cost: {},
  players: '1+',
  implemented: true,
})
