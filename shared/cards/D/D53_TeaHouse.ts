import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { getRoundPlacementOrder } from '../helpers/round-placement'
import { workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'
import { D53_TeaHouse } from '../../cards-display/D/D53_TeaHouse'

const CARD_ID = D53_TeaHouse.id

const anytimeListener: CardListenerRegistration = {
  id: 'D53-tea-house-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    // Only available when player has placed exactly 1 farmer this round
    const roundPlacements = getRoundPlacementOrder(context.player).length
    if (roundPlacements !== 1) return
    // Must still have workers available to place later
    if (workersAvailable(context.state, context.player) <= 0) return
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
          gainLeaf(CARD_ID, { food: 1 }),
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.D53_TeaHouse.anytime',
    }
  },
}

export const D53_TeaHouse_impl = {
  prerequisiteCheck: (_player, state) => {
    if (!state) return true
    return state.round >= 6
  },
  listeners: [anytimeListener],
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    setCardFlag(player, CARD_ID, false)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
