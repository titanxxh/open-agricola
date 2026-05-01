import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'E13_StoneHouseReconstruction'

/**
 * E13 Stone House Reconstruction — At any time, you can renovate your clay house
 * to a stone house without placing a person. (You must pay the normal renovation cost.)
 *
 * BGA: isListeningTo → player has clay house and card not flagged.
 * Once flagged (used), stays flagged (once per game implicitly via room type).
 *
 * Implementation: anytime listener checks for clay house type, not flagged.
 * Triggers renovation action (which handles the cost and house type change).
 */
const anytimeListener: CardListenerRegistration = {
  id: 'E13-stone-house-reconstruction-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.houseType !== 'clay') return
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
          { type: 'leaf', actionId: 'renovation', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: false } },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.E13_StoneHouseReconstruction.anytime',
    }
  },
}

export const E13_StoneHouseReconstruction = new MinorImprovement({
  id: CARD_ID,
  name: 'Stone House Reconstruction',
  deck: 'E',
  number: 13,
  category: 'FARMYARD_-_HOUSE_BUILDING_OR_RENOVATION',
  desc: ['At any time, you can renovate your clay house to a stone house without placing a person. (You must pay the normal renovation cost.)'],
  cost: { stone: 1 },
  vp: 1,
})

export const E13_StoneHouseReconstruction_impl = {
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
