import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A063_DutchWindmill'
const POST_HARVEST_ROUNDS = new Set([5, 8, 10, 12, 14])

const listener: CardListenerRegistration = {
  id: 'A63-dutch-windmill-after-bake',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!POST_HARVEST_ROUNDS.has(context.state.round)) return
    return { flow: gainLeaf(CARD_ID, { food: 3 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A063_DutchWindmill = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Dutch Windmill',
    deck: 'A',
    number: 63,
    category: 'FOOD_PROVIDER',
    desc: ['Each time you take a __Bake Bread__ action in a round immediately following a harvest, you get 3 additional <FOOD>.'],
    cost: { wood: 2, stone: 2 },
    vp: 2,
  },
  impl: cardImpl,
})

export const A063_DutchWindmill_impl = A063_DutchWindmill.impl
