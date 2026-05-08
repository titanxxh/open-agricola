import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'
import { A46_ClawKnife } from '../../cards-display/A/A46_ClawKnife'

const CARD_ID = A46_ClawKnife.id

registerPrerequisite('Exactly 1 Pasture', (player) => player.pastures.length === 1)

const listener: CardListenerRegistration = {
  id: 'A46-claw-knife-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || context.space.id !== 'sheep-market') return
    queueFutureMeeples(context.state, {
      cardId: CARD_ID,
      playerId: context.player.id,
      startRound: context.state.round + 1,
      count: 2,
      resources: { food: 1 },
    })
    return { flow: futureMeeplesNode(), sourceCard: CARD_ID }
  },
}

export const A46_ClawKnife_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
