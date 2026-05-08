import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { getRoundPlacementDetails } from '../helpers/round-placement'
import { D94_HenpeckedHusband } from '../../cards-display/D/D94_HenpeckedHusband'
export { D94_HenpeckedHusband }

const CARD_ID = D94_HenpeckedHusband.id

const MEETING_PLACE_PREFIX = 'meeting-place'

const listener: CardListenerRegistration = {
  id: 'D94-henpecked-husband-after-construct',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const placements = getRoundPlacementDetails(context.player)
    if (placements.length !== 2) return

    // Drop workerId when first is on Meeting Place — recall becomes a no-op
    // while the log decoration still fires.
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
          logCardTrigger: true,
        },
      },
      sourceCard: CARD_ID,
    }
  },
}

export const D94_HenpeckedHusband_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
