import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A155_Conjurer'
const listener: CardListenerRegistration = {
  id: 'A155-conjurer-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || context.space.id !== 'traveling-players') return
    return { flow: gainLeaf(CARD_ID, { wood: 1, grain: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A155_Conjurer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Conjurer',
    deck: 'A',
    number: 155,
    category: 'GOODS_PROVIDER',
    desc: ['Each time you use the __Traveling Players__ accumulation space, you get an additional 1 <WOOD> and 1 <GRAIN>.'],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const A155_Conjurer_impl = A155_Conjurer.impl
