import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A042_ForestLakeHut'
const listener: CardListenerRegistration = {
  id: 'A42-forest-lake-hut-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (spaceId === 'fishing') {
      return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
    }
    if (spaceId === 'forest') {
      return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A042_ForestLakeHut = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Forest Lake Hut',
    deck: 'A',
    number: 42,
    category: 'GOODS_PROVIDER',
    desc: ['Each time you use the __Fishing__/__Forest__ accumulation space, you also get 1 <WOOD>/<FOOD>.'],
    cost: { clay: 2 },
    vp: 1,
  },
  impl: cardImpl,
})

export const A042_ForestLakeHut_impl = A042_ForestLakeHut.impl
