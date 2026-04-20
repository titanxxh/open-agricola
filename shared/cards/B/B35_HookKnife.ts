import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'B35_HookKnife'

// Sheep thresholds indexed by (playerCount - 1): 9/8/7/6/5/5 for 1/2/3/4/5/6 players
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
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.B35_HookKnife.anytime',
    }
  },
}

export const B35_HookKnife = new MinorImprovement({
  id: CARD_ID,
  name: 'Hook Knife',
  deck: 'B',
  number: 35,
  category: 'POINTS_PROVIDER',
  desc: ['Once this game, when you have 9/8/7/6/5/5 <SHEEP> on your farm in a 1-/2-/3-/4-/5-/6- player game, you immediately get 2 bonus <SCORE>.'],
  cost: { wood: 1 },
})

export const B35_HookKnife_impl = {
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
