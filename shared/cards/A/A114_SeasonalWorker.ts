import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A114_SeasonalWorker'
const listener: CardListenerRegistration = {
  id: 'A114-seasonal-worker-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || context.space.id !== 'day-laborer') return
    if (context.state.round < 6) {
      return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
    }
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
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A114_SeasonalWorker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Seasonal Worker',
    deck: 'A',
    number: 114,
    category: 'CROP_PROVIDER',
    desc: ['Each time you use the __Day Laborer__ action space, you get 1 additional <GRAIN>. From round 6 on, you can choose to get 1 <VEGETABLE> instead.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const A114_SeasonalWorker_impl = A114_SeasonalWorker.impl
