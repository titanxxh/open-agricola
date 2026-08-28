import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { isUnconditionalSow } from '../../actions/effects/sow'

const CARD_ID = 'C073_SeaweedFertilizer'

const listener: CardListenerRegistration = {
  id: 'C73-seaweed-fertilizer-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isUnconditionalSow(context.actionContext)) return
    if (context.state.round < 11) {
      return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
    } else {
      return {
        flow: {
          type: 'xor',
          children: [
            gainLeaf(CARD_ID, { grain: 1 }),
            gainLeaf(CARD_ID, { vegetable: 1 }),
          ],
        },
        sourceCard: CARD_ID,
      }
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C073_SeaweedFertilizer = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Seaweed Fertilizer',
    deck: 'C',
    number: 73,
    category: 'CROP_PROVIDER',
    desc: [
        'Each time after you take an unconditional __Sow__ action, you get 1 <GRAIN> from the general supply. From round 11 on, you can get 1 <VEGETABLE> instead.',
      ],
    cost: { food: 2 },
  },
  impl: cardImpl,
})

export const C073_SeaweedFertilizer_impl = C073_SeaweedFertilizer.impl
