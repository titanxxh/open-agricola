import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E141_VegetableVendor } from '../../cards-display/E/E141_VegetableVendor'

const CARD_ID = E141_VegetableVendor.id

const listener: CardListenerRegistration = {
  id: 'E141-vegetable-vendor-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (spaceId === 'major-improvement') {
      return { flow: gainLeaf(CARD_ID, { vegetable: 1 }), sourceCard: CARD_ID }
    }
    if (spaceId === 'vegetable-seeds') {
      return {
        flow: {
          type: 'seq',
          optional: true,
          children: [
            {
              type: 'leaf',
              actionId: 'improvement',
              optional: true,
              sourceCard: CARD_ID,
            },
          ],
        },
        sourceCard: CARD_ID,
      }
    }
  },
}

export const E141_VegetableVendor_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
