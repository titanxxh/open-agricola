import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getRoundPlacementOrder } from '../helpers/round-placement'
import type { CardImpl } from '../registry'
import { D160_Midwife } from '../../cards-display/D/D160_Midwife'
export { D160_Midwife }

const CARD_ID = D160_Midwife.id

/**
 * D160 Midwife (Occupation, D, 160)
 * Each time another player uses the FIRST person they place in a round to
 * take a Family Growth action, card owner gets 1 grain.
 *
 * BGA: onOpponentAfterWishChildren — guarded by
 *   `if ($player->countPlacedFarmers() == 1)` — i.e. only when the placement
 *   that triggered Family Growth is the opponent's first farmer this round.
 *
 * scope 'opponent' — fires when an opponent uses the family growth space.
 * Players 4+.
 */
const FAMILY_GROWTH_SPACES = new Set(['wish-children', 'urgent-wish-children'])

const listener: CardListenerRegistration = {
  id: 'D160-midwife-opponent-family-growth',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!FAMILY_GROWTH_SPACES.has(context.space?.id ?? '')) return
    // BGA: opponent's first farmer this round only.
    // recordRoundPlacement runs before the 'after' hook fires, so the just-placed
    // farmer is already counted — first farmer means exactly 1 placement so far.
    const placements = getRoundPlacementOrder(context.player)
    if (placements.length !== 1) return
    return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
  },
}

export const D160_Midwife_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
