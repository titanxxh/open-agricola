import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { returnToSpaceThenGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A056_Basket'
const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.wood ?? 0) > 0

const listener: CardListenerRegistration = {
  id: 'A56-basket-immediately-after-collect',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context.space)) return
    return returnToSpaceThenGainFlow({
      cardId: CARD_ID,
      cost: { wood: 2 },
      gain: { food: 3 },
      choiceLabelKey: 'minors.A056_Basket.name',
    })
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A056_Basket = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Basket',
    deck: 'A',
    number: 56,
    category: 'FOOD_PROVIDER',
    desc: ['Immediately after each time you use a <WOOD> accumulation space, you can exchange 2 <WOOD> for 3 <FOOD>. If you do, place those 2 <WOOD> on the accumulation space.'],
    cost: { reed: 1 },
    waresSalesmanGains: [{ wood: 1, reed: 1 }],
  },
  impl: cardImpl,
})

export const A056_Basket_impl = A056_Basket.impl
