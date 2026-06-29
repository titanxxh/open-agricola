import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D090_PlowMaker'
const listener: CardListenerRegistration = {
  id: 'D90-plow-maker-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (spaceId !== 'farmland' && spaceId !== 'cultivation') return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
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

export const D090_PlowMaker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Plow Maker',
    deck: 'D',
    number: 90,
    category: 'FARM_PLANNER',
    desc: ['Each time you use the __Farmland__ or __Cultivation__ action space, you can pay 1 <FOOD> to plow 1 additional field.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const D090_PlowMaker_impl = D090_PlowMaker.impl
