import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'E131_MarketMaster'

// Immediately after placing your last person on Traveling Players,
// can play 1 occupation for 1 food.
const listener: CardListenerRegistration = {
  id: 'E131-market-master-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'traveling-players') return
    // Only triggers when placing the last person
    if (workersAvailable(context.state, context.player) > 0) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'play-occupation',
        optional: true,
        sourceCard: CARD_ID,
        params: { costOverride: { food: 1 } },
      },
      sourceCard: CARD_ID,
    }
  },
}

export const E131_MarketMaster = new Occupation({
  id: CARD_ID,
  name: 'Market Master',
  deck: 'E',
  number: 131,
  category: 'ACTION_-_IMPROVEMENTS_OR_OCCUPATIONS',
  desc: ['Immediately after each time you place your last person in a round on the __Traveling Players__ accumulation space, you can play 1 occupation for an occupation cost of 1 <FOOD>.'],
  cost: {},
  players: '4+',
})

export const E131_MarketMaster_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
