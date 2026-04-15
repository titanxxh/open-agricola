import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D141_SeedSeller'

/**
 * D141 Seed Seller — On buy: gain 1 grain.
 * Each time you use the Grain Seeds action space, you get 1 additional grain.
 *
 * BGA reference: D_141_SeedSeller.php
 */
registerCardEffect({
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { grain: 1 }),
})

const listener: CardListenerRegistration = {
  id: 'D141-seed-seller-after-grain-seeds',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-seeds') return
    return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const D141_SeedSeller = new Occupation({
  id: CARD_ID,
  name: "Seed Seller",
  deck: "D",
  number: 141,
  category: "CROP_PROVIDER",
  desc: [
    "When you play this card, you immediately get 1 <GRAIN>. Each time you use the __Grain Seeds__ action space, you get 1 additional <GRAIN>.",
  ],
  cost: {},
  players: "3+",
})
