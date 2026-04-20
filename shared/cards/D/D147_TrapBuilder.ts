import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'D147_TrapBuilder'

// Each time you use Day Laborer, place 1 food, 1 food, and 1 pig on the next 3 round spaces.
const listener: CardListenerRegistration = {
  id: 'D147-trap-builder-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'day-laborer') return
    const round = context.state.round
    queueFutureMeeples(context.state, {
      cardId: CARD_ID,
      playerId: context.player.id,
      entries: [
        { round: round + 1, resources: { food: 1 } },
        { round: round + 2, resources: { food: 1 } },
        { round: round + 3, resources: { boar: 1 } },
      ],
    })
    return { flow: futureMeeplesNode(), sourceCard: CARD_ID }
  },
}

export const D147_TrapBuilder = new Occupation({
  id: CARD_ID,
  name: 'Trap Builder',
  deck: 'D',
  number: 147,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Each time you use the __Day Laborer__ action space, place 1 <FOOD>, 1 <FOOD>, and 1 <PIG> on the next 3 round spaces, respectively. At the start of these rounds, you get the good.'],
  cost: {},
  players: '3+',
  newSet: true,
})

export const D147_TrapBuilder_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
