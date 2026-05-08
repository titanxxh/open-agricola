import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'
import { E62_SourDough } from '../../cards-display/E/E62_SourDough'
export { E62_SourDough }

const CARD_ID = E62_SourDough.id

const anytimeListener: CardListenerRegistration = {
  id: 'E62-sour-dough-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    // All players must still have workers to place
    const allPlayersHaveWorkers = context.state.players.every(
      (p) => workersAvailable(context.state, p) > 0,
    )
    if (!allPlayersHaveWorkers) return
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
          { type: 'leaf', actionId: 'bake-bread', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.E62_SourDough.anytime',
    }
  },
}

export const E62_SourDough_impl = {
  listeners: [anytimeListener],
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    setCardFlag(player, CARD_ID, false)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
