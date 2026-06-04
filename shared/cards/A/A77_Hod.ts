import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A77_Hod'
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

const cardImpl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { clay: 1 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A77_Hod = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Hod",
    deck: "A",
    number: 77,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "When you play this card, you immediately get 1 <CLAY>. Each time any player (including you) uses the __Pig Market__ accumulation space, you immediately get 2 <CLAY>.",
      ],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const A77_Hod_impl = A77_Hod.impl
