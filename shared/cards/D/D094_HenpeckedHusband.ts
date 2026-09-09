import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { getRoundPersonPlacementDetails } from '../helpers/round-placement'

const CARD_ID = 'D094_HenpeckedHusband'
const MEETING_PLACE_PREFIX = 'meeting-place'

const listener: CardListenerRegistration = {
  id: 'D94-henpecked-husband-after-construct',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.trueAction === false) return
    const placements = getRoundPersonPlacementDetails(context.player)
    if (placements.length !== 2) return

    const first = placements[0]!
    if (first.spaceId.startsWith(MEETING_PLACE_PREFIX)) return

    return {
      flow: {
        type: 'leaf',
        actionId: 'recall-placed-worker',
        sourceCard: CARD_ID,
        params: {
          workerId: first.workerId,
          noOpIfMissing: true,
          logCardTrigger: true,
        },
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D094_HenpeckedHusband = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Henpecked Husband",
    deck: "D",
    number: 94,
    category: "ACTIONS_BOOSTER",
    desc: ["Each time you take a __Build Rooms__ action with the second person you place, return the first person you placed home, unless it is on the __Meeting Place__ action space."],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const D094_HenpeckedHusband_impl = D094_HenpeckedHusband.impl
