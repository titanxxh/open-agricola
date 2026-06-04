import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C68_Bookcase'
const listener: CardListenerRegistration = {
  id: 'C68-bookcase-after-occupation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['occupation'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { vegetable: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C68_Bookcase = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Bookcase',
    deck: 'C',
    number: 68,
    category: 'CROP_PROVIDER',
    desc: ['Each time after you play an occupation, you get 1 <VEGETABLE>.'],
    cost: { wood: 2 },
    prerequisite: '1 Occupation',
    occupationPrerequisites: { min: 1 },
  },
  impl: cardImpl,
})

export const C68_Bookcase_impl = C68_Bookcase.impl
