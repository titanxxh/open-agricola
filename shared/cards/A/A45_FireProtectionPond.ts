import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { A45_FireProtectionPond } from '../../cards-display/A/A45_FireProtectionPond'
export { A45_FireProtectionPond }

const CARD_ID = A45_FireProtectionPond.id

const listener: CardListenerRegistration = {
  id: 'A45-fire-protection-pond-after-renovation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    queueFutureMeeples(context.state, {
      cardId: CARD_ID,
      playerId: context.player.id,
      startRound: context.state.round + 1,
      count: 6,
      resources: { food: 1 },
    })
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
          futureMeeplesNode(),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const A45_FireProtectionPond_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
