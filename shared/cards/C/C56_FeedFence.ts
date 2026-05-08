import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getStableTilesBuiltThisAction } from '../helpers/action-snapshot'
import type { CardImpl } from '../registry'
import { C56_FeedFence } from '../../cards-display/C/C56_FeedFence'
export { C56_FeedFence }

const CARD_ID = C56_FeedFence.id

const afterListener: CardListenerRegistration = {
  id: 'C56-feed-fence-after-stables',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['stables'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const built = getStableTilesBuiltThisAction(context.player)
    if (built <= 0) return
    // +2 bonus for 4th stable (when player now has exactly 4 stables)
    const bonusFood = context.player.stableTiles.length === 4 ? 2 : 0
    const totalFood = built + bonusFood
    return { flow: gainLeaf(CARD_ID, { food: totalFood }), sourceCard: CARD_ID }
  },
}

export const C56_FeedFence_impl = {
  listeners: [afterListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
