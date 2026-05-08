import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A42_ForestLakeHut } from '../../cards-display/A/A42_ForestLakeHut'

const CARD_ID = A42_ForestLakeHut.id

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

export const A42_ForestLakeHut_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
