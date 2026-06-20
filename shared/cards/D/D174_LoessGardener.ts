import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D174_LoessGardener'
const listener: CardListenerRegistration = {
  id: 'D174-loess-gardener-after-clay-pit',
  cardIds: [CARD_ID],
  actions: ['collect'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'clay-pit') return
    if ((context.ownerPlayer?.resources.food ?? 0) < 1) return
    return payGainNode({
      cardId: CARD_ID,
      cost: { food: 1 },
      gain: { vegetable: 1 },
      choiceLabelKey: 'ui.interactionResourceExchange',
    })
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D174_LoessGardener = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Loess Gardener',
    deck: 'D',
    number: 174,
    category: 'CROP_PROVIDER',
    desc: ['Each time you use the "Clay Pit" accumulation space, you can also buy 1 vegetable for 1 food.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const D174_LoessGardener_impl = D174_LoessGardener.impl
