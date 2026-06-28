import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E079_FieldSpade'
const listener: CardListenerRegistration = {
  id: 'E79-field-spade-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { stone: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E079_FieldSpade = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Field Spade',
    deck: 'E',
    number: 79,
    category: 'BUILDING_RESOURCES_-_STONE',
    desc: ['Each time after you sow in at least 1 field, you get 1 <STONE>.'],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const E079_FieldSpade_impl = E079_FieldSpade.impl
