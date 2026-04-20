import { Occupation } from '../types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D141_SeedSeller'

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

export const D141_SeedSeller_impl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { grain: 1 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
