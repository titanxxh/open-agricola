import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { getRoundPersonPlacementDetails } from '../helpers/round-placement'
import type { CardImpl } from '../registry'

const CARD_ID = 'D150_GodlySpouse'
const MEETING_PLACE_PREFIX = 'meeting-place'

const afterWishChildrenListener: CardListenerRegistration = {
  id: 'D150-godly-spouse-after-wish-children',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['family-growth'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    const placements = getRoundPersonPlacementDetails(context.player)
    if (placements.length !== 2) return

    // Rule: "unless the first is on Meeting Place" — drop the workerId in that
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

const cardImpl = {
  listeners: [afterWishChildrenListener],
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, _player) => {
    return { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: false } }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D150_GodlySpouse = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Godly Spouse",
    deck: "D",
    number: 150,
    category: "ACTIONS_BOOSTER",
    desc: [
        'Each time you take a __Family Growth__ action with the second person you place in a round, return the first person you placed home, unless it is on the __Meeting Place__ action space.',
      ],
    cost: {},
    players: "4+",
  },
  impl: cardImpl,
})

export const D150_GodlySpouse_impl = D150_GodlySpouse.impl
