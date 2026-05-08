import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { getRoundPlacementDetails } from '../helpers/round-placement'
import type { CardImpl } from '../registry'
import { D150_GodlySpouse } from '../../cards-display/D/D150_GodlySpouse'
export { D150_GodlySpouse }

const CARD_ID = D150_GodlySpouse.id

const MEETING_PLACE_PREFIX = 'meeting-place'

const afterWishChildrenListener: CardListenerRegistration = {
  id: 'D150-godly-spouse-after-wish-children',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['family-growth'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    const placements = getRoundPlacementDetails(context.player)
    if (placements.length !== 2) return

    // BGA: "unless the first is on Meeting Place" — drop the workerId in that
    // case so the recall is a no-op while flag/log decorations still fire.
    const first = placements[0]!
    const targetWorkerId =
      first.spaceId.startsWith(MEETING_PLACE_PREFIX) ? undefined : first.workerId

    return {
      flow: {
        type: 'leaf',
        actionId: 'recall-placed-worker',
        sourceCard: CARD_ID,
        params: {
          workerId: targetWorkerId,
          noOpIfMissing: true,
          flagSourceCard: true,
          logCardTrigger: true,
        },
        optional: true,
        promptKey: 'ui.interactionGodlySpouse',
        choiceLabelKey: 'ui.interactionGodlySpouseUse',
      },
    }
  },
}

export const D150_GodlySpouse_impl = {
  listeners: [afterWishChildrenListener],
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, _player) => {
    return { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: false } }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
