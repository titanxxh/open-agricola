import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A110_Roughcaster'
const constructListener: CardListenerRegistration = {
  id: 'A110-roughcaster-after-construct',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.houseType !== 'clay') return
    return { flow: gainLeaf(CARD_ID, { food: 3 }), sourceCard: CARD_ID }
  },
}

const renovateListener: CardListenerRegistration = {
  id: 'A110-roughcaster-after-renovate',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.houseType !== 'stone') return
    return { flow: gainLeaf(CARD_ID, { food: 3 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [constructListener, renovateListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A110_Roughcaster = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Roughcaster",
    deck: "A",
    number: 110,
    category: "FOOD_PROVIDER",
    desc: ["Each time you build at least 1 clay room or renovate your house from clay to stone, you also get 3 <FOOD>."],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const A110_Roughcaster_impl = A110_Roughcaster.impl
