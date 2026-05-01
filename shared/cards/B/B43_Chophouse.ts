import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'B43_Chophouse'

const listener: CardListenerRegistration = {
  id: 'B43-chophouse-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const id = context.space?.id
    if (id !== 'grain-seeds' && id !== 'vegetable-seeds') return
    const count = id === 'grain-seeds' ? 3 : 2
    queueFutureMeeples(context.state, {
      cardId: CARD_ID,
      playerId: context.player.id,
      startRound: context.state.round + 1,
      count,
      resources: { food: 1 },
    })
    return { flow: futureMeeplesNode(), sourceCard: CARD_ID }
  },
}

export const B43_Chophouse = new MinorImprovement({
  id: CARD_ID,
  name: 'Chophouse',
  deck: 'B',
  number: 43,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you use the __Grain/Vegetable Seeds__ action space, place 1 <FOOD> on each of the next 3/2 round spaces. At the start of these rounds, you get the <FOOD>.'],
  vp: 1,
  altCosts: [{ wood: 2 }, { clay: 2 }],
  newSet: true,
})

export const B43_Chophouse_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
