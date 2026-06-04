import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E50_WildGreens'
const listener: CardListenerRegistration = {
  id: 'E50-wild-greens-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    // Each sow action plants one distinct type → 1 food
    return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E50_WildGreens = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Wild Greens',
    deck: 'E',
    number: 50,
    category: 'FOOD',
    desc: ['Each time you sow, you get 1 <FOOD> for every different type of good that you sow.'],
    cost: {},
  },
  impl: cardImpl,
})

export const E50_WildGreens_impl = E50_WildGreens.impl
