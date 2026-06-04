import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D101_SugarBaker'
const listener: CardListenerRegistration = {
  id: 'D101-sugar-baker-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-utilization') return
    return payGainNode({
      cardId: CARD_ID,
      cost: { food: 1 },
      gain: { score: 1 },
      followUp: [{
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: {
          kind: 'add-resource-to-space',
          spaceId: 'grain-utilization',
          resource: 'food',
          amount: 1,
        },
      }],
    })
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D101_SugarBaker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Sugar Baker',
    deck: 'D',
    number: 101,
    category: 'POINTS_PROVIDER',
    desc: ['Each time after you use the __Grain Utilization__ action space, you can buy 1 bonus <SCORE> for 1 <FOOD>. Place the <FOOD> on the action space (for the next visitor).'],
    cost: {},
    players: '1+',
    extraVp: true,
  },
  impl: cardImpl,
})

export const D101_SugarBaker_impl = D101_SugarBaker.impl
