import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D109_SowingMaster'
const listener: CardListenerRegistration = {
  id: 'D109-sowing-master-after-place-farmer',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-utilization' && context.space?.id !== 'cultivation') return
    return { flow: gainLeaf(CARD_ID, { food: 2 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { wood: 1 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D109_SowingMaster = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Sowing Master',
    deck: 'D',
    number: 109,
    category: 'FOOD_PROVIDER',
    desc: [
        'When you play this card, you immediately get 1 <WOOD>. Each time after you use the __Grain Utilization__ or __Cultivation__ action space, you get 2 <FOOD>.',
      ],
    cost: {},
    players: '1+',
    evenMoreSet: true,
    implemented: true,
  },
  impl: cardImpl,
})

export const D109_SowingMaster_impl = D109_SowingMaster.impl
