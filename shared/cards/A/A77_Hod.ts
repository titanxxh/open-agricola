import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A77_Hod'

/**
 * A77 Hod — On buy: gain 1 clay.
 * Each time any player (including you) uses the Pig Market, owner gets 2 clay.
 *
 * BGA reference: A_77_Hod.php
 */
registerCardEffect({
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { clay: 1 }),
})

const listener: CardListenerRegistration = {
  id: 'A77-hod-any-pig-market',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'pig-market') return
    return { flow: gainLeaf(CARD_ID, { clay: 2 }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const A77_Hod = new MinorImprovement({
  id: CARD_ID,
  name: "Hod",
  deck: "A",
  number: 77,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: [
    "When you play this card, you immediately get 1 <CLAY>. Each time any player (including you) uses the __Pig Market__ accumulation space, you immediately get 2 <CLAY>.",
  ],
  cost: { wood: 1 },
  newSet: true,
})
