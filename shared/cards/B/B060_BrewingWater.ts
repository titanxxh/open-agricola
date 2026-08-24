import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B060_BrewingWater'
const listener: CardListenerRegistration = {
  id: 'B60-brewing-water-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fishing') return
    const request = {
      cardId: CARD_ID,
      playerId: context.player.id,
      startRound: context.state.round + 1,
      count: 6,
      resources: { food: 1 },
    }
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { grain: 1 } }),
          futureMeeplesNode(request),
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

export const B060_BrewingWater = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Brewing Water',
    deck: 'B',
    number: 60,
    category: 'FOOD_PROVIDER',
    desc: ['Each time you use the __Fishing__ accumulation space, you can pay 1 <GRAIN> to place 1 <FOOD> on each of the next 6 round spaces. At the start of these rounds, you get the <FOOD>.'],
    cost: {},
  },
  impl: cardImpl,
})

export const B060_BrewingWater_impl = B060_BrewingWater.impl
