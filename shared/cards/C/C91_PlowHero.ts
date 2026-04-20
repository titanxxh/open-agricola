import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import { getRoundPlacementOrder } from '../helpers/round-placement'
import type { CardImpl } from '../registry'

const CARD_ID = 'C91_PlowHero'

const listener: CardListenerRegistration = {
  id: 'C91-plow-hero-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const id = context.space?.id
    if (id !== 'farmland' && id !== 'cultivation') return
    // Only triggers for the first farmer placed in the round
    const placedOrder = getRoundPlacementOrder(context.player)
    if (placedOrder.length !== 1) return
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

export const C91_PlowHero = new Occupation({
  id: CARD_ID,
  name: 'Plow Hero',
  deck: 'C',
  number: 91,
  category: 'FARM_PLANNER',
  desc: ['Each time you use the __Farmland__ or __Cultivation__ action space with the first person you place in a round, you can plow 1 additional field for 1 <FOOD>.'],
  cost: {},
  players: '1+',
  newSet: true,
})

export const C91_PlowHero_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
