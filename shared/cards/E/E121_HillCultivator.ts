import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E121_HillCultivator } from '../../cards-display/E/E121_HillCultivator'
export { E121_HillCultivator }

const CARD_ID = E121_HillCultivator.id

const listener: CardListenerRegistration = {
  id: 'E121-hill-cultivator-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (spaceId === 'grain-seeds') {
      return { flow: gainLeaf(CARD_ID, { clay: 2 }), sourceCard: CARD_ID }
    }
    if (spaceId === 'vegetable-seeds') {
      return { flow: gainLeaf(CARD_ID, { clay: 3 }), sourceCard: CARD_ID }
    }
  },
}

export const E121_HillCultivator_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
