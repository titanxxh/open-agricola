import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { B35_HookKnife } from '../../cards-display/B/B35_HookKnife'

const CARD_ID = B35_HookKnife.id

const SHEEP_THRESHOLDS = [9, 8, 7, 6, 5, 5]

const anytimeListener: CardListenerRegistration = {
  id: 'B35-hook-knife-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    const threshold = SHEEP_THRESHOLDS[context.state.players.length - 1] ?? 5
    if (context.player.resources.sheep < threshold) return
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.B35_HookKnife.anytime',
    }
  },
}

export const B35_HookKnife_impl = {
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
