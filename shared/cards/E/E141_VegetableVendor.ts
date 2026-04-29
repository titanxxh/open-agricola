import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E141_VegetableVendor'

// Major Improvement space → also get 1 vegetable.
// Vegetable Seeds space → optional Major or Minor Improvement action.
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

export const E141_VegetableVendor = new Occupation({
  id: CARD_ID,
  name: 'Vegetable Vendor',
  deck: 'E',
  number: 141,
  category: 'CROPS',
  desc: ['Each time you use the __Major Improvement__ or __Vegetable Seeds__ action space, you also get 1 <VEGETABLE> or a __Major or Minor Improvement__ action, respectively.'],
  cost: {},
  players: '3+',
})

export const E141_VegetableVendor_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
