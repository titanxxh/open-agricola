import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C61_BeerStein'
const listener: CardListenerRegistration = {
  id: 'C61-beer-stein-after-bake-bread',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return payGainNode({
      cardId: CARD_ID,
      cost: { grain: 1 },
      gain: { food: 2, score: 1 },
    })
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C61_BeerStein = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Beer Stein',
    deck: 'C',
    number: 61,
    category: 'FOOD_PROVIDER',
    desc: [
        'Each time you take a __Bake Bread__ action, you can use this card once to turn 1 <GRAIN> into 2 <FOOD> and 1 bonus <SCORE>.',
      ],
    cost: { clay: 1 },
    extraVp: true,
  },
  impl: cardImpl,
})

export const C61_BeerStein_impl = C61_BeerStein.impl
